# Triển khai DRM cho client

- Gói getHome sẽ trả về drm trong đó có các trường là

```json
{
  "drm": {
    "drmChannel" : 1, // 1: on, 0: off
    "drmMovie" : 1, // 1: on, 0: off
    "drmFields" : ["username","deviceId","dtId","spId","accessToken","contentId","secret","exp"],
    "drmUUID": "UUID",
    "drmURL": "url",
    "drmTTL" : 9000,
    "iss" : "http://drm.gviet.vn/",
    "aud" : "urn:drm.gviet.vn",
    "jwtHeader" : {
        "alg" : "HS256",
        "typ" : "JWT"
    }
  }
}
```

- Gói getSource sẽ trả về các trường sau:

```json
{
  "source": "url",
  "exp": 1502260796, // unix timestamp
  "sign": "jwt sign",
  "drmURL": "url", // nếu có ở đây thì ko dùng config chung nữa ^^
  "iat": 1502260796 // unix timestamp
}
```

- Khi đó, json web token gửi lên hệ thống DRM sẽ là:
```
jwt = jwtHeader . payload . sign
sign là do server trả về từ gói getSource
payload client tự sing theo qui tắc:
payload = {
  iss: iss,
  aud: aud,
  exp: exp,
  sign: md5(drmFields.join('$'))
}
```
