## Zingo PC

## Compiling from source
Zingo PC is written in Electron/Javascript and can be build from source. It will also automatically compile the Rust SDK needed to run zingo-pc.

### Pre-Requisites
You need to have the following software installed before you can build Zingo PC

* [Nodejs (>= 18.0.0) recommended version: v20.9.0 (current) ](https://nodejs.org/en/blog/release/v20.9.0)
* [Yarn](https://yarnpkg.com)
* [Rust stable/nightly version](https://www.rust-lang.org/tools/install)

#### Best Practices to install the NodeJs
It is recommended that you install a version manager instead of just installing NodeJs on you computer.

User Node Version Manager to ensure you can specifically install arbitrary versions across projecs 
without losing your mind and polluting your PC with installs.


NOTE:  To ensure node 20.9.0 on Arch:
paru -S nvm
And follow "Alternate Installations" for 20.9.0 https://wiki.archlinux.org/title/node.js_ I.E.:

```
nvm install 20.9.0
nvm use 20.9.0
```


### OpenSSL 

This project requires OpenSSL. [Official OpenSSL installation guidelines](https://docs.openssl.org/3.2/man7/ossl-guide-introduction/#getting-and-installing-openssl)


### Protobuf Compiler.

Zingo-PC uses grpc and protocol buffers. See [how to install the protobuf compiler](https://grpc.io/docs/protoc-installation/).


### Building Zingo-PC from source

```
git clone https://github.com/zingolabs/zingo-pc.git
cd zingo-pc

yarn install
yarn build
```

To start in locally, run
```
yarn start
```

If for some reason, you couldn't run zingo-pc using the above command, so I compiled the binary instead:
```
yarn dist:linux
or
yarn dist:win-arm64
or
yarn dist:win-x64
or
yarn dist:mac-arm64
or
yarn dist:mac-x64
```

The binaries should be in the *dist* directory.
