class RC5:
    """
    RC5 Block Cipher Implementation in Python.
    Parameters:
    w: Word size in bits (16, 32, or 64). Block size is 2 * w bits.
    r: Number of rounds.
    b: Number of bytes in the secret key.
    """
    def __init__(self, w=32, r=12, b=16):
        self.w = w
        self.r = r
        self.b = b
        self.T = 2 * (r + 1)
        self.w4 = w // 8
        self.w_mask = (1 << w) - 1
        self.w_mod = w
        self.S = []
        
        # Magic constants
        if w == 16:
            self.P = 0xB7E1
            self.Q = 0x9E37
        elif w == 32:
            self.P = 0xB7E15163
            self.Q = 0x9E3779B9
        elif w == 64:
            self.P = 0xB7E151628AED2A6B
            self.Q = 0x9E3779B97F4A7C15
        else:
            raise ValueError("Unsupported word size. Supported sizes: 16, 32, 64")

    def _rotl(self, x, y):
        """Left circular shift of x by y bits."""
        y %= self.w_mod
        return ((x << y) & self.w_mask) | (x >> (self.w_mod - y))

    def _rotr(self, x, y):
        """Right circular shift of x by y bits."""
        y %= self.w_mod
        return (x >> y) | ((x << (self.w_mod - y)) & self.w_mask)

    def key_schedule(self, key):
        """Expands the user secret key into the key schedule table S."""
        if len(key) != self.b:
            raise ValueError(f"Key length must be {self.b} bytes")

        u = self.w4
        c = max(1, (len(key) + u - 1) // u)
        
        # Convert key to little-endian words
        L = [0] * c
        for i in range(len(key) - 1, -1, -1):
            L[i // u] = (L[i // u] << 8) + key[i]

        S = [0] * self.T
        S[0] = self.P
        for i in range(1, self.T):
            S[i] = (S[i - 1] + self.Q) & self.w_mask

        i = j = A = B = 0
        v = 3 * max(c, self.T)
        for _ in range(v):
            A = S[i] = self._rotl((S[i] + A + B), 3)
            B = L[j] = self._rotl((L[j] + A + B), (A + B))
            i = (i + 1) % self.T
            j = (j + 1) % c
        
        self.S = S

    def encrypt_block(self, pt):
        """Encrypts a single block of plaintext. Block size must be 2*w bits."""
        if len(pt) != 2 * self.w4:
            raise ValueError(f"Plaintext block size must be {2 * self.w4} bytes")

        A = int.from_bytes(pt[:self.w4], byteorder='little')
        B = int.from_bytes(pt[self.w4:], byteorder='little')

        A = (A + self.S[0]) & self.w_mask
        B = (B + self.S[1]) & self.w_mask

        for i in range(1, self.r + 1):
            A = (self._rotl(A ^ B, B) + self.S[2 * i]) & self.w_mask
            B = (self._rotl(B ^ A, A) + self.S[2 * i + 1]) & self.w_mask

        ct = A.to_bytes(self.w4, byteorder='little') + B.to_bytes(self.w4, byteorder='little')
        return ct

    def decrypt_block(self, ct):
        """Decrypts a single block of ciphertext. Block size must be 2*w bits."""
        if len(ct) != 2 * self.w4:
            raise ValueError(f"Ciphertext block size must be {2 * self.w4} bytes")

        A = int.from_bytes(ct[:self.w4], byteorder='little')
        B = int.from_bytes(ct[self.w4:], byteorder='little')

        for i in range(self.r, 0, -1):
            B = self._rotr((B - self.S[2 * i + 1]) & self.w_mask, A) ^ A
            A = self._rotr((A - self.S[2 * i]) & self.w_mask, B) ^ B

        B = (B - self.S[1]) & self.w_mask
        A = (A - self.S[0]) & self.w_mask

        pt = A.to_bytes(self.w4, byteorder='little') + B.to_bytes(self.w4, byteorder='little')
        return pt

def pad(data, block_size):
    """Pads data with PKCS7 padding."""
    padding_length = block_size - (len(data) % block_size)
    return data + bytes([padding_length] * padding_length)

def unpad(data):
    """Removes PKCS7 padding."""
    padding_length = data[-1]
    return data[:-padding_length]

if __name__ == "__main__":
    # Example usage for standard RC5-32/12/16
    word_size = 32
    rounds = 12
    key_size = 16
    block_size = (2 * word_size) // 8  # 8 bytes for w=32

    cipher = RC5(w=word_size, r=rounds, b=key_size)

    # 1. Provide a secret key (16 bytes)
    secret_key = b"ThisIsASecretKey"
    cipher.key_schedule(secret_key)

    # 2. Provide a plaintext block (must match block size exactly - 8 bytes)
    message = b"HelloRC5"
    print(f"Original Message: {message}")

    # 3. Encrypt
    ciphertext = cipher.encrypt_block(message)
    print(f"Encrypted (Hex): {ciphertext.hex()}")

    # 4. Decrypt
    decrypted = cipher.decrypt_block(ciphertext)
    print(f"Decrypted Data: {decrypted}")
    
    print("\n" + "="*40 + "\n")
    
    # 5. Handling arbitrary length data with ECB mode (and PKCS7 padding)
    long_msg = b"This is a longer message that requires padding to work with block ciphers!"
    print(f"Long Message: {long_msg}")
    
    padded_msg = pad(long_msg, block_size)
    
    # Encrypt block by block
    enc_data = b""
    for i in range(0, len(padded_msg), block_size):
        block = padded_msg[i:i + block_size]
        enc_data += cipher.encrypt_block(block)
        
    print(f"Encrypted Data (Hex): {enc_data.hex()}")
    
    # Decrypt block by block
    dec_data = b""
    for i in range(0, len(enc_data), block_size):
        block = enc_data[i:i + block_size]
        dec_data += cipher.decrypt_block(block)
    
    unpadded_msg = unpad(dec_data)
    print(f"Decrypted Long Message: {unpadded_msg}")
