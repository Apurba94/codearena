#!/usr/bin/env python3
"""
CodeArena sandbox supervisor.

Runs one untrusted program under CPU-time, wall-time, memory, output-size and
process-count limits and reports exact resource usage.

  * Linux   : setrlimit() in the child + wait4() rusage (exact CPU time / max RSS),
              optional setuid to an unprivileged user, new session so the whole
              process group can be killed.
  * Windows : Job Objects (hard committed-memory cap, active-process cap,
              kill-on-close) + job accounting for CPU time and peak memory.

Protocol (--serve): one JSON request per line on stdin, one JSON reply per line
on stdout. A long-lived supervisor avoids paying interpreter start-up per test.

Request : {"cmd": [...], "cwd": str, "stdin": path|null, "stdout": path,
           "time_limit_ms": int, "memory_limit_mb": int, "output_limit_mb": int,
           "address_space_limit": bool, "env": {..}|null, "max_processes": int}
Reply   : {"status": "OK"|"TLE"|"MLE"|"RE"|"OLE"|"SE", "time_ms": int,
           "wall_ms": int, "memory_kb": int, "exit_code": int|null,
           "signal": int|null, "stderr": str, "error"?: str}
"""
import json
import os
import subprocess
import sys
import threading
import time

IS_WINDOWS = os.name == "nt"
STDERR_KEEP = 4096
CHUNK = 1 << 16


def pump_stdout(pipe, path, limit_bytes, state, on_overflow):
    """Copy child stdout to a file, killing the child when it exceeds the limit."""
    total = 0
    with open(path, "wb") as out:
        while True:
            data = pipe.read1(CHUNK)
            if not data:
                break
            total += len(data)
            if total > limit_bytes:
                state["ole"] = True
                on_overflow()
                # keep draining so the child can't block on a full pipe
                while pipe.read1(CHUNK):
                    pass
                break
            out.write(data)
    pipe.close()


def pump_stderr(pipe, state, keep):
    buf = bytearray()
    while True:
        data = pipe.read1(CHUNK)
        if not data:
            break
        if len(buf) < keep:
            buf.extend(data[: keep - len(buf)])
    state["stderr"] = buf.decode("utf-8", "replace")
    pipe.close()


# --------------------------------------------------------------------------- #
# Windows implementation (Job Objects)
# --------------------------------------------------------------------------- #
if IS_WINDOWS:
    import ctypes
    from ctypes import wintypes

    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    ntdll = ctypes.WinDLL("ntdll")

    class IO_COUNTERS(ctypes.Structure):
        _fields_ = [(n, ctypes.c_ulonglong) for n in (
            "ReadOperationCount", "WriteOperationCount", "OtherOperationCount",
            "ReadTransferCount", "WriteTransferCount", "OtherTransferCount")]

    class JOBOBJECT_BASIC_LIMIT_INFORMATION(ctypes.Structure):
        _fields_ = [
            ("PerProcessUserTimeLimit", ctypes.c_longlong),
            ("PerJobUserTimeLimit", ctypes.c_longlong),
            ("LimitFlags", wintypes.DWORD),
            ("MinimumWorkingSetSize", ctypes.c_size_t),
            ("MaximumWorkingSetSize", ctypes.c_size_t),
            ("ActiveProcessLimit", wintypes.DWORD),
            ("Affinity", ctypes.c_size_t),
            ("PriorityClass", wintypes.DWORD),
            ("SchedulingClass", wintypes.DWORD),
        ]

    class JOBOBJECT_EXTENDED_LIMIT_INFORMATION(ctypes.Structure):
        _fields_ = [
            ("BasicLimitInformation", JOBOBJECT_BASIC_LIMIT_INFORMATION),
            ("IoInfo", IO_COUNTERS),
            ("ProcessMemoryLimit", ctypes.c_size_t),
            ("JobMemoryLimit", ctypes.c_size_t),
            ("PeakProcessMemoryUsed", ctypes.c_size_t),
            ("PeakJobMemoryUsed", ctypes.c_size_t),
        ]

    class JOBOBJECT_BASIC_ACCOUNTING_INFORMATION(ctypes.Structure):
        _fields_ = [
            ("TotalUserTime", ctypes.c_longlong),
            ("TotalKernelTime", ctypes.c_longlong),
            ("ThisPeriodTotalUserTime", ctypes.c_longlong),
            ("ThisPeriodTotalKernelTime", ctypes.c_longlong),
            ("TotalPageFaultCount", wintypes.DWORD),
            ("TotalProcesses", wintypes.DWORD),
            ("ActiveProcesses", wintypes.DWORD),
            ("TotalTerminatedProcesses", wintypes.DWORD),
        ]

    JobObjectBasicAccountingInformation = 1
    JobObjectExtendedLimitInformation = 9
    JOB_OBJECT_LIMIT_ACTIVE_PROCESS = 0x00000008
    JOB_OBJECT_LIMIT_JOB_MEMORY = 0x00000200
    JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION = 0x00000400
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000
    CREATE_SUSPENDED = 0x00000004
    CREATE_NO_WINDOW = 0x08000000

    kernel32.CreateJobObjectW.restype = wintypes.HANDLE
    kernel32.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
    kernel32.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
    kernel32.QueryInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD, ctypes.c_void_p]
    kernel32.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
    kernel32.TerminateJobObject.argtypes = [wintypes.HANDLE, wintypes.UINT]
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    ntdll.NtResumeProcess.argtypes = [wintypes.HANDLE]

    def run_windows(req):
        mem_bytes = int(req["memory_limit_mb"]) * 1024 * 1024
        job = kernel32.CreateJobObjectW(None, None)
        if not job:
            raise OSError(ctypes.get_last_error(), "CreateJobObject failed")
        try:
            info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
            info.BasicLimitInformation.LimitFlags = (
                JOB_OBJECT_LIMIT_JOB_MEMORY
                | JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
                | JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION
                | JOB_OBJECT_LIMIT_ACTIVE_PROCESS
            )
            info.BasicLimitInformation.ActiveProcessLimit = max(1, int(req.get("max_processes") or 1))
            info.JobMemoryLimit = mem_bytes
            if not kernel32.SetInformationJobObject(job, JobObjectExtendedLimitInformation,
                                                    ctypes.byref(info), ctypes.sizeof(info)):
                raise OSError(ctypes.get_last_error(), "SetInformationJobObject failed")

            def job_cpu_ms():
                acc = JOBOBJECT_BASIC_ACCOUNTING_INFORMATION()
                kernel32.QueryInformationJobObject(job, JobObjectBasicAccountingInformation,
                                                   ctypes.byref(acc), ctypes.sizeof(acc), None)
                return (acc.TotalUserTime + acc.TotalKernelTime) // 10000

            def job_peak_bytes():
                ext = JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
                kernel32.QueryInformationJobObject(job, JobObjectExtendedLimitInformation,
                                                   ctypes.byref(ext), ctypes.sizeof(ext), None)
                return max(ext.PeakJobMemoryUsed, ext.PeakProcessMemoryUsed)

            def kill():
                kernel32.TerminateJobObject(job, 1)

            return supervise(req, kill, job_cpu_ms, job_peak_bytes, mem_bytes,
                             creationflags=CREATE_SUSPENDED | CREATE_NO_WINDOW,
                             after_spawn=lambda p: _attach_and_resume(job, p))
        finally:
            kernel32.CloseHandle(job)

    def _attach_and_resume(job, proc):
        handle = int(proc._handle)
        if not kernel32.AssignProcessToJobObject(job, handle):
            err = ctypes.get_last_error()
            proc.kill()
            raise OSError(err, "AssignProcessToJobObject failed")
        ntdll.NtResumeProcess(handle)


# --------------------------------------------------------------------------- #
# POSIX implementation (rlimits + wait4)
# --------------------------------------------------------------------------- #
else:
    import resource
    import signal

    import ctypes

    CLK_TCK = os.sysconf("SC_CLK_TCK")
    CLONE_NEWNET = 0x40000000
    _libc = ctypes.CDLL(None, use_errno=True)

    def unshare_network():
        """Move the calling process into a fresh network namespace with no interfaces except a
        down loopback: no sockets can reach anything. Needs CAP_SYS_ADMIN (root on a VM or
        privileged container); raises OSError where the platform forbids it."""
        if _libc.unshare(CLONE_NEWNET) != 0:
            err = ctypes.get_errno()
            raise OSError(err, os.strerror(err))

    def sweep_uid(uid):
        """Kill every process owned by the sandbox uid (each worker has its own uid, and
        kill(-1) is confined to this PID namespace), catching processes that left the group."""
        pid = os.fork()
        if pid == 0:
            try:
                os.setuid(uid)
                os.kill(-1, signal.SIGKILL)
            except Exception:  # noqa: BLE001
                pass
            os._exit(0)
        os.waitpid(pid, 0)

    def run_posix(req):
        tl_s = int(req["time_limit_ms"]) / 1000.0
        mem_bytes = int(req["memory_limit_mb"]) * 1024 * 1024
        out_bytes = int(req.get("output_limit_mb") or 64) * 1024 * 1024
        uid = req.get("uid")
        gid = req.get("gid")
        max_procs = int(req.get("max_processes") or 0)

        def preexec():
            os.setsid()
            cpu = int(tl_s) + 1
            resource.setrlimit(resource.RLIMIT_CPU, (cpu, cpu + 1))
            if req.get("address_space_limit", True):
                # a little headroom for the runtime's own mappings
                resource.setrlimit(resource.RLIMIT_AS, (mem_bytes + (32 << 20),) * 2)
            resource.setrlimit(resource.RLIMIT_STACK, (resource.RLIM_INFINITY, resource.RLIM_INFINITY)
                               if req.get("unlimited_stack", True) else (8 << 20, 8 << 20))
            resource.setrlimit(resource.RLIMIT_FSIZE, (out_bytes, out_bytes))
            resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
            if max_procs > 0:
                resource.setrlimit(resource.RLIMIT_NPROC, (max_procs, max_procs))
            if req.get("isolate_network"):
                try:
                    unshare_network()
                except OSError:
                    pass  # best effort; reported by --probe
            if gid is not None:
                os.setgroups([])
                os.setgid(int(gid))
            if uid is not None:
                os.setuid(int(uid))

        state = {}

        def kill():
            try:
                os.killpg(state["pid"], signal.SIGKILL)
            except (ProcessLookupError, KeyError, PermissionError):
                pass

        def rusage_cpu_ms():
            return state.get("cpu_ms", 0)

        def rusage_peak_bytes():
            return state.get("maxrss_bytes", 0)

        def waiter(proc):
            # wait4 gives exact CPU time and max RSS of the reaped child
            _, status, ru = os.wait4(proc.pid, 0)
            state["cpu_ms"] = int((ru.ru_utime + ru.ru_stime) * 1000)
            state["maxrss_bytes"] = ru.ru_maxrss * 1024
            proc.returncode = os.waitstatus_to_exitcode(status)

        return supervise(req, kill, rusage_cpu_ms, rusage_peak_bytes, mem_bytes,
                         preexec_fn=preexec, posix_state=state, posix_waiter=waiter)


def supervise(req, kill, cpu_ms_fn, peak_bytes_fn, mem_bytes, creationflags=0,
              after_spawn=None, preexec_fn=None, posix_state=None, posix_waiter=None):
    tl = int(req["time_limit_ms"])
    wall_limit = tl * 2 + 1000
    out_limit = int(req.get("output_limit_mb") or 64) * 1024 * 1024
    stdin_f = open(req["stdin"], "rb") if req.get("stdin") else subprocess.DEVNULL
    env = req.get("env")
    if env is not None:
        base = {k: v for k, v in os.environ.items() if k.upper() in ("PATH", "SYSTEMROOT", "WINDIR", "LANG", "LC_ALL")}
        base.update(env)
        env = base
    state = {"ole": False, "stderr": ""}
    killed = {"why": None}

    def kill_for(reason):
        if killed["why"] is None:
            killed["why"] = reason
        kill()

    start = time.perf_counter()
    try:
        kwargs = dict(stdin=stdin_f, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                      cwd=req.get("cwd"), env=env, close_fds=True)
        if IS_WINDOWS:
            kwargs["creationflags"] = creationflags
        else:
            kwargs["preexec_fn"] = preexec_fn
        proc = subprocess.Popen(req["cmd"], **kwargs)
    finally:
        if stdin_f is not subprocess.DEVNULL:
            stdin_f.close()
    if posix_state is not None:
        posix_state["pid"] = proc.pid
    if after_spawn:
        after_spawn(proc)

    t_out = threading.Thread(target=pump_stdout, daemon=True,
                             args=(proc.stdout, req["stdout"], out_limit, state, lambda: kill_for("OLE")))
    keep = int(req.get("stderr_limit") or STDERR_KEEP)
    t_err = threading.Thread(target=pump_stderr, daemon=True, args=(proc.stderr, state, keep))
    t_out.start()
    t_err.start()

    if posix_waiter is not None:
        # POSIX: reap in a thread (exact rusage); here poll wall clock and live CPU time from /proc
        # so busy loops are cut at TL instead of at the next whole second of RLIMIT_CPU.
        t_wait = threading.Thread(target=posix_waiter, args=(proc,))
        t_wait.start()
        stat_path = "/proc/%d/stat" % proc.pid
        while t_wait.is_alive():
            t_wait.join(0.01)
            if time.perf_counter() - start > wall_limit / 1000.0:
                kill_for("TLE")
            try:
                with open(stat_path) as f:
                    fields = f.read().rsplit(")", 1)[1].split()
                # utime, stime, cutime, cstime (fields 14-17) in clock ticks
                ticks = sum(int(x) for x in fields[11:15])
                if ticks * 1000 // CLK_TCK > tl + 50:
                    kill_for("TLE")
            except (OSError, IndexError, ValueError):
                pass
        t_wait.join()
    else:
        # Windows: poll job CPU time so busy loops are cut off promptly
        while True:
            try:
                proc.wait(timeout=0.01)
                break
            except subprocess.TimeoutExpired:
                pass
            if cpu_ms_fn() > tl + 50 or time.perf_counter() - start > wall_limit / 1000.0:
                kill_for("TLE")
    wall_ms = int((time.perf_counter() - start) * 1000)
    # The main process is gone; anything it left behind (background children holding the output
    # pipe open, daemons that escaped the process group) must not outlive the run.
    kill()
    if not IS_WINDOWS and req.get("uid") is not None:
        sweep_uid(int(req["uid"]))
    t_out.join(5)
    t_err.join(5)

    cpu_ms = int(cpu_ms_fn())
    peak = int(peak_bytes_fn())
    code = proc.returncode
    sig = None
    if not IS_WINDOWS and code is not None and code < 0:
        sig = -code

    status = "OK"
    if state["ole"] or killed["why"] == "OLE":
        status = "OLE"
    elif killed["why"] == "TLE" or cpu_ms > tl:
        status = "TLE"
    elif peak > mem_bytes or (code != 0 and peak >= mem_bytes * 0.95):
        status = "MLE"
    elif not IS_WINDOWS and sig in (24,):  # SIGXCPU
        status = "TLE"
    elif not IS_WINDOWS and sig == 25:  # SIGXFSZ
        status = "OLE"
    elif code != 0:
        status = "RE"
        err = state["stderr"]
        if "MemoryError" in err or "OutOfMemoryError" in err or "heap out of memory" in err or "std::bad_alloc" in err:
            status = "MLE"

    return {
        "status": status,
        "time_ms": cpu_ms if status != "TLE" else max(cpu_ms, tl),
        "wall_ms": wall_ms,
        # a refused allocation can inflate the job's peak counter; never report above the cap
        "memory_kb": (min(peak, mem_bytes) if status == "MLE" else peak) // 1024,
        "exit_code": code,
        "signal": sig,
        "stderr": state["stderr"],
    }


def run(req):
    try:
        return run_windows(req) if IS_WINDOWS else run_posix(req)
    except FileNotFoundError as e:
        return {"status": "SE", "error": "executable not found: %s" % e, "time_ms": 0, "wall_ms": 0,
                "memory_kb": 0, "exit_code": None, "signal": None, "stderr": ""}
    except Exception as e:  # noqa: BLE001 - report everything to the judge
        return {"status": "SE", "error": "%s: %s" % (type(e).__name__, e), "time_ms": 0, "wall_ms": 0,
                "memory_kb": 0, "exit_code": None, "signal": None, "stderr": ""}


def serve():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            res = run(req)
            res["id"] = req.get("id")
        except Exception as e:  # noqa: BLE001
            res = {"status": "SE", "error": "bad request: %s" % e}
        sys.stdout.write(json.dumps(res) + "\n")
        sys.stdout.flush()


def probe():
    """Report which isolation features work on this host (shown on the admin dashboard)."""
    info = {"platform": sys.platform, "privileged": False, "network": False}
    if IS_WINDOWS:
        info["mechanism"] = "job objects"
    else:
        info["mechanism"] = "rlimits"
        info["privileged"] = os.geteuid() == 0
        pid = os.fork()
        if pid == 0:
            try:
                unshare_network()
                os._exit(0)
            except OSError:
                os._exit(1)
        _, status = os.waitpid(pid, 0)
        info["network"] = os.waitstatus_to_exitcode(status) == 0
    print(json.dumps(info))


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--serve":
        serve()
    elif len(sys.argv) > 1 and sys.argv[1] == "--probe":
        probe()
    else:
        print(json.dumps(run(json.loads(sys.stdin.read()))))
