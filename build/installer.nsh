; Custom NSIS steps for Y-core installer.
; Kills any running Y-core and Steam instances BEFORE replacing files.

!macro preInit
  SetShellVarContext all

  ; Kill all blocking processes
  nsExec::ExecToLog 'taskkill /F /T /IM "Y-core.exe"'
  nsExec::ExecToLog 'taskkill /F /T /IM "steam.exe"'
  nsExec::ExecToLog 'taskkill /F /T /IM "steamwebhelper.exe"'

  ; Wait for processes to fully terminate and release file handles
  Sleep 3000
!macroend
