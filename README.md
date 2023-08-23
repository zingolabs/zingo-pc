## Zingo PC

## Compiling from source
Zingo PC is written in Electron/Javascript and can be build from source. It will also automatically compile the Rust SDK needed to run zingo-pc.

#### Pre-Requisites
You need to have the following software installed before you can build Zingo PC Fullnode

* [Nodejs recommended version: v16.16.0 (LTS) ](https://nodejs.org/en/blog/release/v16.16.0)
* [Yarn](https://yarnpkg.com)
* [Rust stable/nightly version](https://www.rust-lang.org/tools/install)

NOTE:  To ensure node 16.16 on Arch:
paru -S nvm
And follow "Alternate Installations" for 16.16 https://wiki.archlinux.org/title/node.js_ I.E.:

```
nvm install 16.16
nvm use 16.16
```
  
NOTE2: You have to install `openssl` & `protobuf compiler` as well.

```
git clone https://github.com/zingolabs/zingo-pc.git
cd zingo-pc

yarn install
yarn build
```

If for some reason you get an `ERR_OSSL_EVP_UNSUPPORTED` error when running `yarn build` in node v17, v18 or higher, just run the command with `NODE_OPTIONS=--openssl-legacy-provider` env variable, or downgrade the `node` version to v16.16.0.

To start in locally, run
```
yarn start
```

If for some reason, you couldn't run zingo-pc using the above command, so I compiled the binary instead:
```
yarn dist:linux
or
yarn dist:win
or
yarn dist:mac-arm64
or
yarn dist:mac-x64
```

The binaries should be in the *dist* directory.
