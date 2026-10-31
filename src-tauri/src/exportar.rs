//! Exportación de datos a Excel (.xlsx).

use rust_xlsxwriter::{Format, Workbook};
use serde::Deserialize;
use serde_json::Value;

#[derive(Deserialize)]
pub struct Columna {
    titulo: String,
    /// "texto", "numero", "pesos" o "fecha".
    #[serde(default)]
    tipo: String,
    #[serde(default)]
    ancho: Option<f64>,
}

#[derive(Deserialize)]
pub struct Hoja {
    nombre: String,
    columnas: Vec<Columna>,
    filas: Vec<Vec<Value>>,
}

/// Escribe un libro de Excel con una hoja por tabla.
#[tauri::command]
pub fn exportar_excel(ruta: String, hojas: Vec<Hoja>) -> Result<(), String> {
    escribir_libro(&ruta, &hojas).map_err(|e| {
        log::error!("exportar_excel: {e}");
        format!("No se pudo guardar el archivo de Excel: {e}")
    })
}

fn escribir_libro(ruta: &str, hojas: &[Hoja]) -> Result<(), rust_xlsxwriter::XlsxError> {
    let mut libro = Workbook::new();
    let titulo = Format::new().set_bold().set_background_color("#E3EEF5");
    let pesos = Format::new().set_num_format("\"$\" #,##0.00");
    let numero = Format::new().set_num_format("0");
    for hoja in hojas {
        let h = libro.add_worksheet();
        h.set_name(&hoja.nombre)?;
        for (c, col) in hoja.columnas.iter().enumerate() {
            let c = c as u16;
            h.write_string_with_format(0, c, &col.titulo, &titulo)?;
            h.set_column_width(c, col.ancho.unwrap_or(16.0))?;
        }
        h.set_freeze_panes(1, 0)?;
        for (f, fila) in hoja.filas.iter().enumerate() {
            let f = f as u32 + 1;
            for (c, valor) in fila.iter().enumerate() {
                let tipo = hoja.columnas.get(c).map(|x| x.tipo.as_str()).unwrap_or("");
                let c = c as u16;
                match valor {
                    Value::Null => {}
                    Value::Number(n) => {
                        let n = n.as_f64().unwrap_or_default();
                        match tipo {
                            "pesos" => h.write_number_with_format(f, c, n, &pesos)?,
                            "numero" => h.write_number_with_format(f, c, n, &numero)?,
                            _ => h.write_number(f, c, n)?,
                        };
                    }
                    Value::Bool(b) => {
                        h.write_string(f, c, if *b { "Sí" } else { "No" })?;
                    }
                    Value::String(s) => {
                        h.write_string(f, c, s)?;
                    }
                    otro => {
                        h.write_string(f, c, otro.to_string())?;
                    }
                }
            }
        }
        if !hoja.columnas.is_empty() {
            h.autofilter(0, 0, hoja.filas.len() as u32, hoja.columnas.len() as u16 - 1)?;
        }
    }
    libro.save(ruta)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escribe_un_libro_con_varias_hojas() {
        let hojas: Vec<Hoja> = serde_json::from_value(serde_json::json!([
            { "nombre": "Pacientes", "columnas": [{ "titulo": "Nombre" }, { "titulo": "Monto", "tipo": "pesos" }],
              "filas": [["Ana", 25000], ["Beto", null]] },
            { "nombre": "Gastos", "columnas": [{ "titulo": "Descripción" }], "filas": [] }
        ]))
        .unwrap();
        let ruta = std::env::temp_dir().join(format!("psigestion-prueba-{}.xlsx", std::process::id()));
        escribir_libro(ruta.to_str().unwrap(), &hojas).unwrap();
        let bytes = std::fs::read(&ruta).unwrap();
        assert_eq!(&bytes[..2], b"PK", "un .xlsx es un zip");
        std::fs::remove_file(&ruta).unwrap();
    }
}
