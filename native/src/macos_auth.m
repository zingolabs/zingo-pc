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

// Resolves a security-scoped bookmark (base64) and starts accessing the resource,
// returning 0 when access was refused, 1 when it was granted, and 2 when it was
// granted against a stale bookmark whose replacement is written to refreshed_out.
int start_security_scoped_access(const char *bookmark_b64, char *refreshed_out, int refreshed_cap) {
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
        if (![url startAccessingSecurityScopedResource]) return 0;
        if (!isStale || !refreshed_out || refreshed_cap <= 0) return 1;

        NSError *remakeError = nil;
        NSData *remade = [url bookmarkDataWithOptions:NSURLBookmarkCreationWithSecurityScope
                       includingResourceValuesForKeys:nil
                                        relativeToURL:nil
                                                 error:&remakeError];
        if (!remade || remakeError) return 1;
        const char *encoded = [[remade base64EncodedStringWithOptions:0] UTF8String];
        if (!encoded || strlen(encoded) + 1 > (size_t)refreshed_cap) return 1;
        strlcpy(refreshed_out, encoded, (size_t)refreshed_cap);
        return 2;
    }
}
