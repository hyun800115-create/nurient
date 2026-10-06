"""Rewrite an APK so every stored (uncompressed) entry starts on a 4-byte boundary."""
import sys, zipfile

src, dst = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(src) as zin, open(dst, "wb") as f:
    with zipfile.ZipFile(f, "w") as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            out = zipfile.ZipInfo(info.filename, date_time=(2008, 1, 1, 0, 0, 0))
            out.compress_type = info.compress_type
            out.external_attr = info.external_attr
            out.extra = b""
            if info.compress_type == zipfile.ZIP_STORED:
                offset = f.tell() + 30 + len(info.filename.encode("utf-8"))
                out.extra = b"\0" * ((4 - offset % 4) % 4)
            zout.writestr(out, data)
