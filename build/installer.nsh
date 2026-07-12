; Custom NSIS steps for Y-core installer.
; Kills any running Y-core instance BEFORE replacing files so updates never
; hang on a locked executable (even when triggered by an older/buggy updater).

!macro preInit
  nsExec::ExecToLog 'taskkill /IM "Y-core.exe" /F'
!macroend
