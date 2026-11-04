; Ganchos del instalador NSIS de PsiGestion (ver bundle > windows > nsis > installerHooks).
;
; Al actualizar desde la app (/P, instalación pasiva), el instalador de Tauri busca con el
; Restart Manager de Windows si algún proceso usa PsiGestion.exe y, si no lo puede cerrar,
; aborta con "No se ha podido cerrar PsiGestion". Eso pasaba aunque la app ya se hubiera
; cerrado (un proceso que Windows no termina de liberar). Para no depender de eso:
;   1. se cierra a la fuerza cualquier PsiGestion.exe que haya quedado, y
;   2. se aparta el PsiGestion.exe viejo con otro nombre (Windows deja renombrar un
;      ejecutable aunque esté en uso), así el chequeo no encuentra nada y el nuevo se copia.
; Los .old que queden se borran en la próxima actualización o al desinstalar.
; En una instalación normal (no pasiva) no se toca nada: el instalador pregunta como siempre.

!macro NSIS_HOOK_PREINSTALL
  ${If} $PassiveMode = 1
    nsExec::Exec 'taskkill /F /IM "${MAINBINARYNAME}.exe"'
    Pop $0
    Sleep 1000
    ; Restos de actualizaciones anteriores (si alguno sigue en uso, queda para la próxima).
    Delete "$INSTDIR\${MAINBINARYNAME}-*.old"
    ${If} ${FileExists} "$INSTDIR\${MAINBINARYNAME}.exe"
      System::Call 'kernel32::GetTickCount() i .r0'
      ClearErrors
      Rename "$INSTDIR\${MAINBINARYNAME}.exe" "$INSTDIR\${MAINBINARYNAME}-$0.old"
      ${If} ${Errors}
        DetailPrint "No se pudo apartar el ejecutable anterior; se sigue igual."
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Delete "$INSTDIR\${MAINBINARYNAME}-*.old"
!macroend
