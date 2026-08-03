; Custom NSIS steps for Y-core installer.
; Kills any running Y-core instance BEFORE replacing files so updates never
; hang on a locked executable.

!macro preInit
  SetShellVarContext all

  ; Kill Y-core process only (user already closed Steam manually before restarting)
  nsExec::ExecToLog 'taskkill /F /IM "Y-core.exe"'

  ; Wait for process to fully terminate
  Sleep 2000
!macroend
