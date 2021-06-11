## upload API

+ route: /upload
+ url query:
  - width (optional) - for resize
  - height (optional) - for resize
  - url (optional) - image url
  - signature: md5(data+'$'+SECRET) (data = fileSizeInByte | url)
+ multipart/form-data
  - imageFile: file data
+ -> response: {id: number} or {ec:400}
+ get image url base on id
```javascript
function getImageUrl(base, id) {
  const tmp = Math.floor(id / 10000)
  const path1 = Math.floor(tmp / 1000000) + 1
  const path2 = Math.floor((tmp % 1000000) / 1000) + 1

  return `${base}${path1}/${path2}/${id}.png`
}

```

+ example:
```html
<html>
  <body>
    <form
      action='/upload?signature=abc123&width=1024&height=768'
      method='post'
      encType="multipart/form-data">
        <input type="file" name="imageFile" />
        <input type='submit' value='Upload!' />
    </form>
  </body>
</html>
```
