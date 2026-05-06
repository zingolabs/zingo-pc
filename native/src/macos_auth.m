#import <LocalAuthentication/LocalAuthentication.h>
#import <Foundation/Foundation.h>
#import <AppKit/AppKit.h>

int check_mac_auth_available(void) {
    @autoreleasepool {
        LAContext *ctx = [[LAContext alloc] init];
        NSError *err = nil;
        BOOL can = [ctx canEvaluatePolicy:LAPolicyDeviceOwnerAuthentication error:&err];
        return can ? 1 : 0;
    }
}

int verify_mac_auth_sync(const char *reason_utf8) {
    @autoreleasepool {
        LAContext *ctx = [[LAContext alloc] init];
        NSString *reason = [NSString stringWithUTF8String:reason_utf8 ? reason_utf8 : "Authenticate"];

        dispatch_semaphore_t sema = dispatch_semaphore_create(0);
        __block BOOL result = NO;

        [ctx evaluatePolicy:LAPolicyDeviceOwnerAuthentication
            localizedReason:reason
                      reply:^(BOOL success, NSError * __unused error) {
            result = success;
            dispatch_semaphore_signal(sema);
        }];

        dispatch_semaphore_wait(sema, DISPATCH_TIME_FOREVER);
        return result ? 1 : 0;
    }
}

// Resolves a security-scoped bookmark (base64) and starts accessing the resource.
// Must be called in the process that needs file access (renderer/preload).
// Returns 1 on success, 0 on error.
int start_security_scoped_access(const char *bookmark_b64) {
    @autoreleasepool {
        if (!bookmark_b64) return 0;
        NSString *b64str = [NSString stringWithUTF8String:bookmark_b64];
        NSData *bookmarkData = [[NSData alloc] initWithBase64EncodedString:b64str options:0];
        if (!bookmarkData) return 0;
        NSError *error = nil;
        BOOL isStale = NO;
        NSURL *url = [NSURL URLByResolvingBookmarkData:bookmarkData
                                               options:NSURLBookmarkResolutionWithSecurityScope
                                         relativeToURL:nil
                                   bookmarkDataIsStale:&isStale
                                                 error:&error];
        if (!url || error) return 0;
        return [url startAccessingSecurityScopedResource] ? 1 : 0;
    }
}
