#!/bin/sh

set -eux


if [ "$(whoami)" != "root" ]; then
	exec sudo /bin/sh $0
fi

exec 2>/tmp/konf.log

version=16.10.0
bin=/tmp/konf/node-v${version}-linux-x64/bin/node

mkdir -p /tmp/konf

if [ ! -f "$bin" ]; then
	wget https://nodejs.org/dist/v${version}/node-v${version}-linux-x64.tar.xz -O /tmp/konf/nodejs.tar.xz
	cd /tmp/konf
	tar xvf /tmp/konf/nodejs.tar.xz
	cd -
fi

exec "$bin" /tmp/konf.js