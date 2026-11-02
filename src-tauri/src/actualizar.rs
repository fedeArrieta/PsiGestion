//! Instalación de actualizaciones en Windows.
//!
//! El plugin de actualización lanza el instalador y cierra la app con `std::process::exit`.
//! Ese cierre "ordenado" a veces se traba (quedó un PsiGestion.exe sin ventana que no se podía
//! terminar sin reiniciar la PC), y el instalador fallaba con "No se ha podido cerrar PsiGestion".
//! Acá se hace lo mismo pero cerrando la base primero y terminando el proceso en el acto,
//! sin pasar por la limpieza de salida que se trababa.

use serde::Serialize;
use tauri::{AppHandle, Runtime, ipc::Channel};
use tauri_plugin_updater::UpdaterExt;

#[derive(Clone, Serialize)]
#[serde(tag = "evento", content = "datos", rename_all = "camelCase")]
pub enum Progreso {
    Inicio { total: Option<u64> },
    Avance { bytes: usize },
    Instalando,
}

/// Descarga la versión nueva (verificando su firma), cierra la base, lanza el instalador y cierra la app.
#[tauri::command]
pub async fn instalar_actualizacion<R: Runtime>(app: AppHandle<R>, progreso: Channel<Progreso>) -> Result<(), String> {
    let update = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or("No hay una versión nueva para instalar.")?;

    let canal = progreso.clone();
    let mut empezo = false;
    let bytes = update
        .download(
            move |bytes, total| {
                if !empezo {
                    empezo = true;
                    let _ = canal.send(Progreso::Inicio { total });
                }
                let _ = canal.send(Progreso::Avance { bytes });
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;
    let _ = progreso.send(Progreso::Instalando);

    log::info!("versión {} descargada: se cierra la app para instalarla", update.version);
    // Que la base quede cerrada y consistente antes de terminar el proceso.
    crate::base::cerrar(&app).await;
    lanzar_instalador(&update.version, &bytes)
}

#[cfg(windows)]
fn lanzar_instalador(version: &str, bytes: &[u8]) -> Result<(), String> {
    use windows_sys::Win32::System::Threading::{GetCurrentProcess, TerminateProcess};

    // Instalador NSIS (…-setup.exe), el que publica "Publicar versión".
    if !bytes.starts_with(b"MZ") {
        return Err("El archivo descargado no es un instalador válido.".into());
    }
    let carpeta = std::env::temp_dir().join(format!("PsiGestion-{version}-actualizacion"));
    std::fs::create_dir_all(&carpeta).map_err(|e| format!("No se pudo preparar el instalador: {e}"))?;
    let ruta = carpeta.join(format!("PsiGestion_{version}_x64-setup.exe"));
    std::fs::write(&ruta, bytes).map_err(|e| format!("No se pudo guardar el instalador: {e}"))?;

    // /P: instalación pasiva (solo barra de progreso), /R: abrir la app al terminar,
    // /UPDATE: le indica al instalador que es una actualización (mismos argumentos que usa el plugin).
    std::process::Command::new(&ruta)
        .args(["/P", "/R", "/UPDATE"])
        .spawn()
        .map_err(|e| format!("No se pudo abrir el instalador: {e}"))?;

    log::logger().flush();
    // Terminar ya: el instalador encuentra la app cerrada y no queda ningún proceso trabado.
    unsafe {
        TerminateProcess(GetCurrentProcess(), 0);
    }
    Ok(())
}

#[cfg(not(windows))]
fn lanzar_instalador(_version: &str, _bytes: &[u8]) -> Result<(), String> {
    Err("La instalación automática solo está disponible en Windows.".into())
}
