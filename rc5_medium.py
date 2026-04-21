def rotl(x, y, w=32):
    """Left circular shift of x by y bits, constrained to w bits."""
    mask = (1 << w) - 1
    return ((x << (y & (w - 1))) | (x >> (w - (y & (w - 1))))) & mask

def rotr(x, y, w=32):
    
    mask = (1 << w) - 1
    return ((x >> (y & (w - 1))) | (x << (w - (y & (w - 1))))) & mask

class RC5:
    
    def __init__(self, key, w=32, r=12):
        self.w, self.r, self.mask = w, r, (1 << w) - 1
        
        # 1. Expand secret key into words array L
        u = w // 8
        L = [0] * max(1, len(key) // u)
        for i in range(len(key) - 1, -1, -1):
            L[i // u] = (L[i // u] << 8) + key[i]

        # 2. Initialize the state array S using magic constants
        self.T = 2 * (r + 1)
        self.S = [0] * self.T
        self.S[0] = 0xB7E15163 # Constant P32
        for i in range(1, self.T):
            self.S[i] = (self.S[i - 1] + 0x9E3779B9) & self.mask # Constant Q32

        # 3. Mix the user key into the state array S
        i = j = A = B = 0
        for _ in range(3 * max(len(L), self.T)):
            A = self.S[i] = rotl(self.S[i] + A + B, 3, w)
            B = L[j] = rotl(L[j] + A + B, A + B, w)
            i, j = (i + 1) % self.T, (j + 1) % len(L)

    def encrypt(self, pt):
        """Encrypts a single 2-word block (e.g., 8 bytes)."""
        u = self.w // 8
        A = int.from_bytes(pt[:u], 'little')
        B = int.from_bytes(pt[u:], 'little')

        A, B = (A + self.S[0]) & self.mask, (B + self.S[1]) & self.mask
        for i in range(1, self.r + 1):
            A = (rotl(A ^ B, B, self.w) + self.S[2 * i]) & self.mask
            B = (rotl(B ^ A, A, self.w) + self.S[2 * i + 1]) & self.mask
            
        return A.to_bytes(u, 'little') + B.to_bytes(u, 'little')

    def decrypt(self, ct):
        """Decrypts a single 2-word block (e.g., 8 bytes)."""
        u = self.w // 8
        A = int.from_bytes(ct[:u], 'little')
        B = int.from_bytes(ct[u:], 'little')

        for i in range(self.r, 0, -1):
            B = rotr((B - self.S[2 * i + 1]) & self.mask, A, self.w) ^ A
            A = rotr((A - self.S[2 * i]) & self.mask, B, self.w) ^ B

        A, B = (A - self.S[0]) & self.mask, (B - self.S[1]) & self.mask
        return A.to_bytes(u, 'little') + B.to_bytes(u, 'little')

if __name__ == '__main__':
    # Usage Example
    cipher = RC5(b'SecretKey_16Byte')
    pt = b'RC5Block' # exactly 8 bytes limit 
    ct = cipher.encrypt(pt)
    print(f"Plaintext: {pt} -> Encrypted: {ct.hex()} -> Decrypted: {cipher.decrypt(ct)}")
