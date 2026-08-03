; Custom NSIS steps for Y-core installer.
; Kills any running Y-core instance BEFORE replacing files so updates never
; hang on a locked executable (even when triggered by an older/buggy updater).
; Also closes Steam to avoid file lock conflicts during DLL injection updates.

!macro preInit
  SetShellVarContext all

  ; Kill all blocking processes with maximum force
  ; Using wmic instead of taskkill for more reliable termination
  nsExec::Exec 'wmic process where name="Y-core.exe" delete /nointeractive'
  nsExec::Exec 'wmic process where name="steam.exe" delete /nointeractive'
  nsExec::Exec 'wmic process where name="steamwebhelper.exe" delete /nointeractive'

  ; Fallback to taskkill if wmic fails
  nsExec::ExecToLog 'taskkill /F /IM "Y-core.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "steam.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "steamwebhelper.exe"'

  ; Extended wait for file handles to be released by Windows
  Sleep 5000
!macroend
