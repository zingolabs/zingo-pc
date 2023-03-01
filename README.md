## Zingo PC

## Compiling from source
Zingo PC is written in Electron/Javascript and can be build from source. It will also automatically compile the Rust SDK needed to run zingo-pc.

#### Pre-Requisites
You need to have the following software installed before you can build Zecwallet Fullnode

* [Nodejs v12.16.1 or higher](https://nodejs.org)
* [Yarn](https://yarnpkg.com)
* [Rust v1.40+](https://www.rust-lang.org/tools/install)

For some reason, the Neon native module will not compile from inside this repo.
First compile it from [this repo](https://github.com/james-katz/zingo-wrapper)

After compilation, copy `native.node` to `./zingo-pc/src/`
```
$ cp /path/to/zingo-wrapper/native.node /path/to/zingo-pc/src/native.node
```

Then clone and compile this repo:

```
git clone https://github.com/zingolabs/zingo-pc.git
cd zingo-pc

yarn install
yarn build
```

if for some reason (like it happened to me) you get an `ERR_OSSL_EVP_UNSUPPORTED` error when runnong `yarn build`, just run the command with `NODE_OPTIONS=--openssl-legacy-provider` env variable.

To start in locally, run
```
yarn start
```

For some reason, I couldn't run zingo-pc using the above command, so I compiled the binary instead:
```
yarn dist:linux
```

The binary should be in the *dist* directory.
