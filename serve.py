#!/usr/bin/env python3
"""Servidor de desarrollo para probar la PWA en local.

Existe porque `python -m http.server` toma los tipos MIME del registro de
Windows, donde .css y .js suelen figurar como text/plain. Con ese tipo el
navegador ignora la hoja de estilos y se niega a registrar el service worker,
así que ni hay diseño ni modo offline. Aquí los tipos van fijados a mano.

    python3 serve.py            -> http://localhost:8000
    python3 serve.py 8080       -> otro puerto
"""

import socket
import sys
import threading
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


class IPv6Server(ThreadingHTTPServer):
    address_family = socket.AF_INET6


def listen(port):
    """Escucha en las dos formas de localhost.

    En Windows, 'localhost' se resuelve antes a ::1 (IPv6) que a 127.0.0.1, así
    que atarse solo a IPv4 da 'connection refused' en el navegador. Abrimos un
    socket por familia y seguimos adelante si alguna no está disponible.
    """
    servers = []
    for cls, host in ((IPv6Server, '::1'), (ThreadingHTTPServer, '127.0.0.1')):
        try:
            servers.append(cls((host, port), Handler))
        except OSError as err:
            print('Aviso: no se pudo escuchar en %s -> %s' % (host, err))
    return servers


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    servers = listen(port)
    if not servers:
        print('No se pudo abrir el puerto %d. ¿Lo tienes ya ocupado por otro '
              'servidor? Prueba: python3 serve.py 8001' % port)
        return 1

    print('Órbita en http://localhost:%d' % port)
    print('Linux    en http://localhost:%d/linux/' % port)
    print('Ctrl+C para parar.')
    for server in servers[1:]:
        threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        servers[0].serve_forever()
    except KeyboardInterrupt:
        print('\nParado.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
