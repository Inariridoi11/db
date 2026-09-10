#!/usr/bin/env python3
"""Servidor de desarrollo para probar la PWA en local.

Existe porque `python -m http.server` toma los tipos MIME del registro de
Windows, donde .css y .js suelen figurar como text/plain. Con ese tipo el
navegador ignora la hoja de estilos y se niega a registrar el service worker,
así que ni hay diseño ni modo offline. Aquí los tipos van fijados a mano.

    python3 serve.py            -> http://localhost:8000
    python3 serve.py 8080       -> otro puerto
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.md': 'text/plain; charset=utf-8',
    '.wasm': 'application/wasm',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.bin': 'application/octet-stream',
    '.gz': 'application/octet-stream',
    '': 'application/octet-stream',
}


class Handler(SimpleHTTPRequestHandler):
    extensions_map = dict(TYPES)

    def end_headers(self):
        # Sin caché del navegador: así cada recarga trae los archivos del disco
        # y no una copia vieja. La caché offline la sigue gestionando sw.js.
        self.send_header('Cache-Control', 'no-store')
        SimpleHTTPRequestHandler.end_headers(self)

    def log_message(self, fmt, *args):
        if args and str(args[1]).startswith('404') and '/favicon.ico' in str(args[0]):
            return          # ruido de Chrome pidiendo un icono que no usamos
        SimpleHTTPRequestHandler.log_message(self, fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = ThreadingHTTPServer(('127.0.0.1', port), partial(Handler))
    print('Órbita en http://localhost:%d' % port)
    print('Linux    en http://localhost:%d/linux/' % port)
    print('Ctrl+C para parar.')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nParado.')


if __name__ == '__main__':
    main()
