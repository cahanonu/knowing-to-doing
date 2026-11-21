"""Encrypt a dashboard export so it can sit in the public repo as data.enc.json.
Usage: KTD_PASSCODE=... python3 src/encrypt_data.py <export.json> <out data.enc.json>
The passcode is never written to the repo. Keep it in offline-app-data/passcode.txt (private)."""
import os,sys,json,base64,hashlib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
def norm(p): return "".join(ch for ch in p.lower() if ch.isalnum())
code=norm(os.environ["KTD_PASSCODE"]); src,dst=sys.argv[1],sys.argv[2]
salt=os.urandom(16); iv=os.urandom(12); it=250000
key=hashlib.pbkdf2_hmac("sha256",code.encode(),salt,it,32)
pt=open(src,"rb").read(); json.loads(pt)
ct=AESGCM(key).encrypt(iv,pt,None)
b=lambda x:base64.b64encode(x).decode()
json.dump({"v":1,"kdf":"PBKDF2-SHA256","iter":it,"salt":b(salt),"iv":b(iv),"ct":b(ct)},open(dst,"w"))
print("wrote",dst,len(ct))
