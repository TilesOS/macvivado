#!/usr/bin/env bash
# Native Apple Silicon source build. All outputs stay in this workspace's .cache.
set -euo pipefail
cd "$(dirname "$0")/.."
[[ $(uname -s) == Darwin && $(uname -m) == arm64 ]] || { echo 'Apple Silicon macOS required'; exit 1; }
for tool in cmake ninja git python3.12; do command -v "$tool" >/dev/null || { echo 'Install prerequisites: brew install cmake ninja boost eigen pkgconf python@3.12'; exit 1; }; done
mkdir -p .cache/downloads .cache/src .cache/toolchain
oss_name=oss-cad-suite-darwin-arm64-20261019.tgz
oss_hash=be3a09ae67c5c52cca5200ca8978626b3e7efcecf30f65735ff7db0eaf6c4b6f
if [[ ! -f ".cache/downloads/$oss_name" ]]; then
  curl -fL --retry 2 "https://github.com/YosysHQ/oss-cad-suite-build/releases/download/2026-10-19/$oss_name" -o ".cache/downloads/$oss_name"
fi
printf '%s  %s\n' "$oss_hash" ".cache/downloads/$oss_name" | shasum -a 256 -c -
if [[ ! -d .cache/toolchain/oss-cad-suite ]]; then tar -xzf ".cache/downloads/$oss_name" -C .cache/toolchain; fi
checkout() {
  local name=$1 revision=$2
  if [[ ! -d ".cache/src/$name/.git" ]]; then git clone "https://github.com/openXC7/$name.git" ".cache/src/$name"; fi
  git -C ".cache/src/$name" fetch origin "$revision"
  git -C ".cache/src/$name" checkout --detach "$revision"
  [[ $(git -C ".cache/src/$name" rev-parse HEAD) == "$revision" ]]
}
checkout nextpnr 3e5c2cdd256745fb5adb93f3ffe8c3795b1e7abf
checkout prjxray ed3331c6200f421164101388759fc2860b0f5634
checkout prjxray-db 517d66a383676cb971177ea92b0ff3b6ea6e8690
git -C .cache/src/nextpnr submodule update --init --recursive
git -C .cache/src/prjxray submodule update --init --recursive
cmake -S .cache/src/nextpnr -B .cache/src/nextpnr/build -G Ninja \
  -DARCH=himbaechel -DHIMBAECHEL_UARCH=xilinx -DHIMBAECHEL_XILINX_DEVICES=xc7a100t \
  -DHIMBAECHEL_PRJXRAY_DB="$PWD/.cache/src/prjxray-db" \
  -DXilinxChipdb_Python3_EXECUTABLE="$(command -v python3.12)" \
  -DBUILD_GUI=OFF -DBUILD_PYTHON=OFF -DUSE_OPENMP=OFF -DCMAKE_BUILD_TYPE=Release -DCMAKE_POLICY_VERSION_MINIMUM=3.5
cmake --build .cache/src/nextpnr/build -j "${MACVIVADO_BUILD_JOBS:-4}"
cmake -S .cache/src/prjxray -B .cache/src/prjxray/build -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_POLICY_VERSION_MINIMUM=3.5
cmake --build .cache/src/prjxray/build --target xc7frames2bit -j "${MACVIVADO_BUILD_JOBS:-4}"
mkdir -p .cache/toolchain/openxc7/{bin,share,python,licenses}
cp .cache/src/nextpnr/build/nextpnr-himbaechel .cache/toolchain/openxc7/bin/
cp .cache/src/prjxray/build/tools/xc7frames2bit .cache/toolchain/openxc7/bin/
cp .cache/src/nextpnr/build/himbaechel/uarch/xilinx/chipdb-xc7a100t.bin .cache/toolchain/openxc7/share/
cp -R .cache/src/prjxray-db/artix7 .cache/toolchain/openxc7/share/
.cache/toolchain/oss-cad-suite/bin/tabbypy3 -m pip install --upgrade --target .cache/toolchain/openxc7/python \
  'textx==4.3.0' 'Arpeggio==2.0.3' 'simplejson==3.20.2' 'intervaltree==3.1.0' 'sortedcontainers==2.4.0' 'pyyaml==6.0.3'
cp -R .cache/src/prjxray/prjxray .cache/toolchain/openxc7/python/
cp -R .cache/src/prjxray/third_party/fasm/fasm .cache/toolchain/openxc7/python/
cp .cache/src/prjxray/utils/fasm2frames.py .cache/toolchain/openxc7/python/
cp .cache/src/nextpnr/COPYING .cache/toolchain/openxc7/licenses/nextpnr.txt
cp .cache/src/prjxray/LICENSE .cache/toolchain/openxc7/licenses/prjxray.txt
cp .cache/src/prjxray-db/LICENSE .cache/toolchain/openxc7/licenses/prjxray-db.txt
cp .cache/src/prjxray/third_party/fasm/LICENSE .cache/toolchain/openxc7/licenses/fasm.txt
npm run tools:prepare
