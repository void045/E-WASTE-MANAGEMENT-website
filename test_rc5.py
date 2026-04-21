def rotl(x, y): return ((x << (y & 31)) | (x >> (32 - (y & 31)))) & 0xFFFFFFFF
def rotr(x, y): return ((x >> (y & 31)) | (x << (32 - (y & 31)))) & 0xFFFFFFFF

class RC5:
    def __init__(self, key):
        L = [int.from_bytes(key[i:i+4], 'little') for i in range(0, len(key), 4)]
        self.S = [0xB7E15163]
        for _ in range(1, 26): self.S.append((self.S[-1] + 0x9E3779B9) & 0xFFFFFFFF)
        A = B = i = j = 0
        for _ in range(3 * max(len(L), 26)):
            A = self.S[i] = rotl(self.S[i] + A + B, 3)
            B = L[j] = rotl(L[j] + A + B, A + B)
            i, j = (i + 1) % 26, (j + 1) % len(L)

    def encrypt(self, pt):
        A, B = int.from_bytes(pt[:4], 'little'), int.from_bytes(pt[4:], 'little')
        A, B = (A + self.S[0]) & 0xffffffff, (B + self.S[1]) & 0xffffffff
        for i in range(1, 13):
            A = (rotl(A ^ B, B) + self.S[2*i]) & 0xffffffff
            B = (rotl(B ^ A, A) + self.S[2*i+1]) & 0xffffffff
        return A.to_bytes(4, 'little') + B.to_bytes(4, 'little')

    def decrypt(self, ct):
        A, B = int.from_bytes(ct[:4], 'little'), int.from_bytes(ct[4:], 'little')
        for i in range(12, 0, -1):
            B = rotr((B - self.S[2*i+1]) & 0xffffffff, A) ^ A
            A = rotr((A - self.S[2*i]) & 0xffffffff, B) ^ B
        return ((A - self.S[0]) & 0xffffffff).to_bytes(4, 'little') + ((B - self.S[1]) & 0xffffffff).to_bytes(4, 'little')

if __name__ == '__main__':
    c = RC5(b'ThisIsASecretKey')
    ct = c.encrypt(b'HelloRC5')
    print("Pt: b'HelloRC5'", "Ct:", ct.hex(), "Dec:", c.decrypt(ct))
