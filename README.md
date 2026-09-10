# Órbita — juego arcade que funciona sin conexión

Web instalable (PWA): al abrirla ofrece **instalarla** y **descargar todo su contenido**
en el dispositivo, así que después puedes abrirla y jugar sin internet (incluso en modo avión).

![Menú](docs/menu.png)

## Cómo probarla

Necesita **HTTPS o localhost** (es un requisito de los service workers; con `file://` no funciona).

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

## Cómo publicarla en GitHub Pages

Dos opciones:

- **Sencilla**: *Settings → Pages → Source: Deploy from a branch*, elige la rama y la carpeta `/ (root)`.
- **Con Actions**: fusiona a `main` y el workflow `.github/workflows/pages.yml` la despliega
  (*Settings → Pages → Source: GitHub Actions*).

La URL resultante (`https://<usuario>.github.io/<repo>/`) ya sirve por HTTPS, así que la
instalación y el modo offline funcionan directamente.

## Cómo funciona el modo offline

- `sw.js` es un **service worker** que, al instalarse, descarga y guarda en la caché del
  navegador todos los archivos del juego (HTML, CSS, JS, iconos y manifiesto).
- Después responde **primero desde la caché**: si no hay red, la web se abre igual.
  Las navegaciones caen al `index.html` guardado.
- El botón **«Descargar contenido offline»** fuerza esa descarga a mano y la tarjeta del
  menú muestra cuántos archivos hay guardados (`11/11` = listo).
- El botón **«Instalar»** aparece cuando el navegador lo permite (Chrome, Edge, Android…).
  En iPhone/iPad se instala con *Compartir → Añadir a pantalla de inicio*.
- Para publicar cambios, sube el número de `VERSION` en `sw.js`: el nuevo service worker
  vuelve a descargar todo y borra la caché antigua.

## El juego

Arcade espacial en canvas, sin ningún recurso externo (los sonidos se sintetizan con
WebAudio y los gráficos se dibujan por código), que es justo lo que permite que funcione
offline sin descargas extra.

- **Teclado**: `←` `→` o `A` `D` para moverte, `espacio` para disparar, `P` pausa, `Enter` para empezar.
- **Móvil**: arrastra el dedo para mover la nave; dispara sola.
- Oleadas cada 22 s, asteroides, cazas que te disparan y mejoras: `S` escudo, `R` disparo
  rápido, `+` vida extra. El récord se guarda en el dispositivo.

## Archivos

| Archivo | Para qué sirve |
| --- | --- |
| `index.html` | Estructura, HUD y menú con los botones de instalar/descargar |
| `styles.css` | Estilos |
| `game.js` | El juego (bucle, física, dibujo y sonido) |
| `app.js` | Instalación, estado del cacheo offline y enlace con el juego |
| `sw.js` | Service worker: descarga y sirve el contenido sin conexión |
| `manifest.webmanifest` | Nombre, iconos y colores de la app instalada |
| `icons/` | Iconos de la app (incluye uno *maskable* para Android) |
