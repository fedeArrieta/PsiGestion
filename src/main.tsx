import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { registrarErroresGlobales } from "./errores";
import { aplicarTema, leerTema } from "./marca/tema";
import "@fontsource-variable/plus-jakarta-sans";

registrarErroresGlobales();
aplicarTema(leerTema());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
