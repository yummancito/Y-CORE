; Custom NSIS steps for Y-core installer.
; Kills any running Y-core instance BEFORE replacing files so updates never
; hang on a locked executable (even when triggered by an older/buggy updater).
; Also closes Steam to avoid file lock conflicts during DLL injection updates.

!macro preInit
  nsExec::ExecToLog 'taskkill /IM "Y-core.exe" /F'
  nsExec::ExecToLog 'taskkill /IM "steam.exe" /F'
  nsExec::ExecToLog 'taskkill /IM "steamwebhelper.exe" /F'
  ; Wait a moment for processes to fully terminate
  Sleep 2000
!macroend
