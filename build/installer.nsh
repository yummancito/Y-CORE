; Custom NSIS steps for Y-core installer.
; Kills any running Y-core instance BEFORE replacing files so updates never
; hang on a locked executable (even when triggered by an older/buggy updater).
; Also closes Steam to avoid file lock conflicts during DLL injection updates.

!macro preInit
  ; Require admin privileges to kill system processes
  !ifdef NSIS_WIN10_32BIT
    SetShellVarContext all
  !endif

  ; Close all blocking processes with timeout
  nsExec::ExecToLog 'taskkill /IM "Y-core.exe" /F /T'
  nsExec::ExecToLog 'taskkill /IM "steam.exe" /F /T'
  nsExec::ExecToLog 'taskkill /IM "steamwebhelper.exe" /F /T'

  ; Longer wait for processes to fully terminate and release file handles
  Sleep 3000
!macroend
