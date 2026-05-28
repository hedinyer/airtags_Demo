from __future__ import annotations

from findmy import (
    AppleAccount,
    AsyncAppleAccount,
    LocalAnisetteProvider,
    LoginState,
    RemoteAnisetteProvider,
    SmsSecondFactorMethod,
    TrustedDeviceSecondFactorMethod,
)


def _login_sync(account: AppleAccount) -> None:
    email = input("email? > ")
    password = input("passwd? > ")

    state = account.login(email, password)

    if state == LoginState.REQUIRE_2FA:
        methods = account.get_2fa_methods()

        for i, method in enumerate(methods):
            if isinstance(method, TrustedDeviceSecondFactorMethod):
                print(f"{i} - Dispositivo de confianza")
            elif isinstance(method, SmsSecondFactorMethod):
                print(f"{i} - SMS ({method.phone_number})")

        ind = int(input("Metodo? > "))
        method = methods[ind]
        method.request()
        code = input("Codigo? > ")
        method.submit(code)


async def _login_async(account: AsyncAppleAccount) -> None:
    email = input("email? > ")
    password = input("passwd? > ")

    state = await account.login(email, password)

    if state == LoginState.REQUIRE_2FA:
        methods = await account.get_2fa_methods()

        for i, method in enumerate(methods):
            if isinstance(method, TrustedDeviceSecondFactorMethod):
                print(f"{i} - Dispositivo de confianza")
            elif isinstance(method, SmsSecondFactorMethod):
                print(f"{i} - SMS ({method.phone_number})")

        ind = int(input("Metodo? > "))
        method = methods[ind]
        await method.request()
        code = input("Codigo? > ")
        await method.submit(code)


def get_account_sync(
    store_path: str,
    anisette_url: str | None,
    libs_path: str | None,
) -> AppleAccount:
    try:
        acc = AppleAccount.from_json(store_path, anisette_libs_path=libs_path)
    except FileNotFoundError:
        ani = (
            LocalAnisetteProvider(libs_path=libs_path)
            if anisette_url is None
            else RemoteAnisetteProvider(anisette_url)
        )
        acc = AppleAccount(ani)
        _login_sync(acc)

    acc.to_json(store_path)
    return acc
