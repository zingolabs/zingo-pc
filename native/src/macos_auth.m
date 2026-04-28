#import <LocalAuthentication/LocalAuthentication.h>
#import <Foundation/Foundation.h>

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
                      reply:^(BOOL success, NSError *error) {
            result = success;
            dispatch_semaphore_signal(sema);
        }];

        dispatch_semaphore_wait(sema, DISPATCH_TIME_FOREVER);
        return result ? 1 : 0;
    }
}
