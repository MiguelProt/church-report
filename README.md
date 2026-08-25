# Bitácora de reportes

Primera versión de un sistema responsive para capturar reportes con una cantidad variable de asuntos. El frontend puede publicarse en GitHub Pages; Google Apps Script funciona como API y Google Sheets almacena los datos y arma la hoja de impresión.

## Estructura

- `index.html`, `styles.css`, `app.js`: formulario web responsive.
- `.env.example`: ejemplo de la variable utilizada al compilar localmente.
- `scripts/build.mjs`: genera `dist/` e inyecta la URL pública de Apps Script.
- `.github/workflows/pages.yml`: publicación automática en GitHub Pages.
- `config.js.example`: ejemplo de configuración para despliegue.
- `apps-script/Code.gs`: API, almacenamiento, plantilla y exportación PDF.
- `apps-script/appsscript.json`: configuración del proyecto de Apps Script.

## 1. Crear la hoja y el backend

1. Crea una hoja nueva en Google Sheets.
2. Ve a **Extensiones → Apps Script**.
3. Copia `apps-script/Code.gs` al archivo `Code.gs` del editor.
4. En **Configuración del proyecto**, activa la visualización del manifiesto y reemplaza `appsscript.json` con el archivo de este repositorio.
5. Abre **Configuración del proyecto → Propiedades del script** y agrega `SPREADSHEET_ID` con el ID de la hoja.
6. Ejecuta manualmente `setupSpreadsheet` una vez y acepta los permisos. Se crearán las pestañas `Reportes`, `Asuntos` y `Plantilla`.
7. Selecciona **Implementar → Nueva implementación → Aplicación web**.
8. Configura **Ejecutar como: Yo** y el acceso adecuado para tus usuarios. Para un enlace público, usa **Cualquier persona**. En organizaciones de Google Workspace puede convenir limitarlo al dominio.
9. Copia la URL que termina en `/exec`.

Cada modificación posterior de Apps Script requiere crear una versión nueva de la implementación.

Para la hoja actual, el valor de `SPREADSHEET_ID` es `1-W_QQDIqOWhDh7L4sc6eCyNptnsTnM3X3n15Osu_BGU`. Se guarda en Propiedades del script y no en el repositorio.

## 2. Compilar localmente

Copia `.env.example` como `.env`, pega la URL `/exec` y ejecuta `npm run build`. El sitio listo para publicar quedará en `dist/`. `.env` y `dist/` están excluidos de Git.

Puedes probar el frontend abriendo `index.html` mediante un servidor local. El formulario conserva automáticamente un borrador en el navegador.

El envío usa `no-cors` porque las respuestas POST de `ContentService` de Apps Script no se pueden leer de forma fiable desde un origen estático distinto. Cada envío incluye un `requestId` único y el frontend consulta su estado mediante JSONP. El borrador solo se elimina después de recibir una confirmación real de Apps Script; los errores de Sheets se muestran en la interfaz y conservan los datos capturados.

## 3. Publicar en GitHub Pages

1. Crea un repositorio vacío en GitHub.
2. Desde esta carpeta, agrega el remoto y sube la rama principal.
3. En GitHub abre **Settings → Secrets and variables → Actions → Variables**.
4. Crea `APPS_SCRIPT_WEB_APP_URL` y pega la URL `/exec`.
5. Abre **Settings → Pages** y selecciona **GitHub Actions** como origen.
6. Sube o empuja la rama `main`. El workflow construirá y publicará `dist/`.
7. Abre la dirección mostrada por GitHub Pages y envía un reporte de prueba.

## PDF opcional

La pestaña `Plantilla` queda actualizada con el último reporte y lista para imprimir. Para crear un PDF automáticamente al guardar:

1. Crea una carpeta en Google Drive y copia su ID desde la URL.
2. Agrega `PDF_FOLDER_ID` en las Propiedades del script de Apps Script.
3. Cambia `GENERATE_PDF_ON_SAVE` a `true` en `apps-script/Code.gs`.
4. Vuelve a implementar Apps Script con una versión nueva.

El frontend abrirá el PDF generado en otra pestaña después de guardar. Los archivos quedan en la carpeta configurada.

## Datos y seguridad

- Los campos obligatorios son Organización, Nombre del líder, Fecha y Persona/Asunto en cada ficha.
- El backend limita cada reporte a 50 asuntos, recorta textos muy largos y neutraliza fórmulas enviadas a Sheets.
- `LockService` evita que dos envíos simultáneos mezclen filas.
- Si el formulario maneja información sensible, limita la aplicación web al dominio de Google Workspace o agrega autenticación antes de compartirla públicamente.

## Versionado inicial

Si la carpeta todavía no es un repositorio:

```sh
git init
git add .
git commit -m "feat: primera version del sistema de reportes"
git branch -M main
```

Después conecta el remoto de GitHub que corresponda.
