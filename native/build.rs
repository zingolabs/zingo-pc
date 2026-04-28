fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        cc::Build::new()
            .file("src/macos_auth.m")
            .compile("macos_auth");
        println!("cargo:rustc-link-lib=framework=LocalAuthentication");
        println!("cargo:rustc-link-lib=framework=Foundation");
    }
}
