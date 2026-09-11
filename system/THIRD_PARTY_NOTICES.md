# Third-party software

Sharjeenux boots third-party software inside an emulated x86 machine. The MIT
license in `LICENSE` applies only to Sharjeenux's own JavaScript wrapper.

Principal components include:

- v86 0.5.420: BSD-2-Clause, <https://github.com/copy/v86>
- ws 8.21.0: MIT, <https://github.com/websockets/ws>
- SeaBIOS/SeaVGABIOS 1.16.2: LGPL-3.0-only,
  <https://www.seabios.org/>
- Linux 6.12.94: GPL-2.0-only, <https://kernel.org>
- Buildroot 2025.02.15: GPL-2.0-or-later, <https://buildroot.org>
- BusyBox 1.37.0: GPL-2.0-only, <https://busybox.net>
- GNU C Library 2.41: LGPL-2.1-or-later,
  <https://www.gnu.org/software/libc/>
- GCC 13.4 runtime libraries: GPL with the GCC Runtime Library Exception,
  <https://gcc.gnu.org/onlinedocs/libstdc++/manual/license.html>
- Node.js 20.20.2 (unofficial Linux x86 build): MIT,
  <https://github.com/nodejs/node>
- npm CLI: Artistic-2.0, <https://github.com/npm/cli>
- TypeScript 6.0.3: Apache-2.0,
  <https://github.com/microsoft/TypeScript>
- Python 3.12.13: Python-2.0, <https://www.python.org/>
- pip: MIT, <https://github.com/pypa/pip>
- OpenJDK 21.0.11+10: GPL-2.0 with Classpath Exception,
  <https://github.com/openjdk/jdk21u>
- Apache Maven 3.9.16: Apache-2.0, <https://maven.apache.org/>
- Git 2.48.2: GPL-2.0-only, <https://git-scm.com/>
- curl/libcurl: curl license, <https://curl.se/>
- GNU Wget 1.25.0: GPL-3.0-or-later,
  <https://www.gnu.org/software/wget/>

This list is a summary, not a replacement for the complete license manifest
and license texts produced by Buildroot. See `SOURCE_OFFER.md` for the offer
that accompanies the binary image. The matching release process also creates
`sharjeenux-corresponding-source-1.0.1.tar.xz`. Use that archive together
with `compliance/build-definition.tar.xz` for the collected sources, exact
patches and configurations, licenses, and Buildroot scripts used for the
image.
