"""Renders Lethal Grid's two music loops (menu and battle) to WAV. Original compositions."""
import numpy as np, wave, sys

SR = 44100
rng = np.random.default_rng(7)

def midi(n): return 440.0 * 2 ** ((n - 69) / 12)

NOTE = {'C':0,'C#':1,'Db':1,'D':2,'D#':3,'Eb':3,'E':4,'F':5,'F#':6,'Gb':6,'G':7,'G#':8,'Ab':8,'A':9,'A#':10,'Bb':10,'B':11}
def n(s):
    name, octv = s[:-1], int(s[-1])
    return 12 * (octv + 1) + NOTE[name]

def pluck(freq, dur, bright=0.5, decay=0.996):
    """Plucked string from decaying harmonics, so every note is exactly in tune."""
    N = int(dur * SR); t = np.arange(N) / SR
    base = (1 - decay) * 900 + 0.8          # overall ring time
    y = np.zeros(N)
    kmax = int(min(14, 9000 / freq))
    for k in range(1, kmax + 1):
        amp = (1 / k ** (1.6 - bright)) * (1 + 0.3 * np.sin(k * 1.7))
        y += amp * np.sin(2 * np.pi * k * freq * t * (1 + 0.0004 * k)) * np.exp(-t * (base + k * k * 0.9 * (1.2 - bright)))
    attack = rng.normal(0, 1, N) * np.exp(-t * 400) * 0.25
    y = y * (1 - np.exp(-t * 900)) + attack
    fade = np.ones(N); f = min(N, int(0.02 * SR)); fade[-f:] = np.linspace(1, 0, f)
    return y * fade * 0.5

def adsr(N, a, d, s, r):
    env = np.ones(N) * s
    A, D, R = int(a*SR), int(d*SR), int(r*SR)
    A = min(A, N); env[:A] = np.linspace(0, 1, A)
    D = min(D, N - A); env[A:A+D] = np.linspace(1, s, D)
    R = min(R, N); env[N-R:] *= np.linspace(1, 0, R)
    return env

def flute(freq, dur, vib=5.2, depth=0.006):
    N = int(dur * SR); t = np.arange(N) / SR
    vibr = 1 + depth * np.sin(2*np.pi*vib*t) * np.clip(t / 0.25, 0, 1)
    ph = 2*np.pi*np.cumsum(freq * vibr) / SR
    y = np.sin(ph) + 0.18*np.sin(2*ph) + 0.06*np.sin(3*ph)
    breath = rng.normal(0, 1, N); breath = np.convolve(breath, np.ones(8)/8, 'same') * 0.05
    return (y + breath) * adsr(N, 0.06, 0.1, 0.8, min(0.12, dur*0.4))

def fiddle(freq, dur):
    """Bowed lead: band-limited saw with vibrato, softened."""
    N = int(dur * SR); t = np.arange(N)/SR
    vibr = 1 + 0.007*np.sin(2*np.pi*5.5*t)*np.clip(t/0.2, 0, 1)
    ph = 2*np.pi*np.cumsum(freq*vibr)/SR
    y = sum(np.sin(k*ph)/k * (0.85**k) for k in range(1, 12))
    return y * adsr(N, 0.04, 0.08, 0.75, min(0.1, dur*0.3)) * 0.6

def drone(freqs, dur):
    N = int(dur*SR); t = np.arange(N)/SR
    y = np.zeros(N)
    for f in freqs:
        for k, amp in [(1, 1), (2, 0.45), (3, 0.25), (4, 0.12), (5, 0.06)]:
            y += amp*np.sin(2*np.pi*f*k*t + rng.uniform(0, 6.28))
    trem = 1 + 0.08*np.sin(2*np.pi*0.25*t)
    return y * trem

def frame_drum(dur=0.5, pitch=95, amp=1.0):
    N = int(dur*SR); t = np.arange(N)/SR
    f = pitch * (1 + 0.8*np.exp(-t*40))
    body = np.sin(2*np.pi*np.cumsum(f)/SR) * np.exp(-t*9)
    slap = rng.normal(0, 1, N) * np.exp(-t*60) * 0.35
    return (body + slap) * amp

def tamb(dur=0.12, amp=0.25):
    N = int(dur*SR); t = np.arange(N)/SR
    x = rng.normal(0, 1, N); x = x - np.convolve(x, np.ones(6)/6, 'same')
    jingle = sum(np.sin(2*np.pi*f*t) for f in (5200, 6900, 8300)) * 0.15
    return (x*0.7 + jingle) * np.exp(-t*35) * amp

def reverb(x, secs=2.2, wet=0.22):
    N = int(secs*SR); t = np.arange(N)/SR
    ir = rng.normal(0, 1, N) * np.exp(-t*3.2)
    ir = np.convolve(ir, np.ones(30)/30, 'same')  # darken
    ir /= np.sqrt(np.sum(ir**2))
    L = len(x) + N
    size = 1 << (L-1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[:L]
    out = np.zeros(L); out[:len(x)] = x
    return out*(1-wet) + y*wet*1.6

class Track:
    def __init__(self, seconds):
        self.N = int(seconds*SR)
        self.bus = {}
    def add(self, bus, start, sig, gain=1.0):
        b = self.bus.setdefault(bus, np.zeros(self.N + 6*SR))
        i = int(start*SR); b[i:i+len(sig)] += sig*gain
    def render(self, loop_len, wet):
        mix = np.zeros(self.N + 6*SR)
        for name, b in self.bus.items():
            mix[:len(b)] += b
        wetmix = reverb(mix, wet=wet)
        L = int(loop_len*SR)
        # Fold everything past the loop point back onto the start so the loop is seamless
        out = wetmix[:L].copy()
        tail = wetmix[L:]
        k = 0
        while k < len(tail):
            seg = tail[k:k+L]; out[:len(seg)] += seg; k += L
        out /= np.max(np.abs(out)) / 0.89
        return out

def write(path, y):
    st = np.stack([y, y], 1)
    data = (st*32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(data.tobytes())

# ---------------------------------------------------------------- Menu: "The Keep at Dusk"
def menu():
    beat = 60/60  # 6/8 felt in dotted quarters at 60; eighth = beat/3
    e = beat/3
    bar = 6*e
    chords = [  # (bass, triad tones), D dorian
        ('D3', ['D4','F4','A4']), ('C3', ['C4','E4','G4']), ('D3', ['D4','F4','A4']), ('A2', ['A3','C4','E4']),
        ('Bb2', ['Bb3','D4','F4']), ('F3', ['F4','A4','C5']), ('C3', ['C4','E4','G4']), ('D3', ['D4','A4','D5']),
    ] * 2
    bars = len(chords)
    T = Track(bars*bar)
    for b, (bass, tri) in enumerate(chords):
        t0 = b*bar
        T.add('bass', t0, pluck(midi(n(bass)), bar*1.1, bright=0.2, decay=0.998), 0.55)
        pat = [tri[0], tri[1], tri[2], tri[1], tri[2], tri[1]]
        if b % 4 == 3: pat = [tri[0], tri[1], tri[2], tri[2], tri[1], tri[0]]
        for i, note in enumerate(pat):
            T.add('harp', t0 + i*e, pluck(midi(n(note)+12), 1.6, bright=0.6), 0.32)
    T.add('drone', 0, drone([midi(n('D2')), midi(n('A2'))], bars*bar + 1) * adsr(int((bars*bar+1)*SR), 2, 0.1, 1, 2), 0.05)
    # Flute melody enters on the second pass
    mel = [  # (bar offset in eighths, note, length in eighths)
        (0, 'A5', 3), (3, 'G5', 1), (4, 'F5', 2), (6, 'E5', 3), (9, 'D5', 3),
        (12, 'F5', 2), (14, 'E5', 1), (15, 'D5', 3), (18, 'C5', 6),
        (24, 'D5', 3), (27, 'F5', 3), (30, 'A5', 3), (33, 'G5', 3),
        (36, 'F5', 2), (38, 'E5', 1), (39, 'D5', 2), (41, 'C#5', 1), (42, 'D5', 6),
    ]
    start = 8*bar
    for off, note, ln in mel:
        T.add('flute', start + off*e, flute(midi(n(note)), ln*e*0.98), 0.22)
    # A softer echo of the phrase on the first pass, an octave down on the harp
    for off, note, ln in mel[:9]:
        T.add('harp2', 0 + off*e + 2*bar, pluck(midi(n(note)-12), 1.2, bright=0.4), 0.18)
    return T.render(bars*bar, wet=0.3)

# ---------------------------------------------------------------- Battle: "Hold the Courtyard"
def battle():
    bpm = 132; q = 60/bpm; e = q/2; bar = 4*q
    prog = ['D', 'D', 'Bb', 'C', 'D', 'D', 'F', 'A'] * 2
    roots = {'D': 'D2', 'Bb': 'Bb1', 'C': 'C2', 'F': 'F2', 'A': 'A1'}
    bars = len(prog)
    T = Track(bars*bar)
    for b, ch in enumerate(prog):
        t0 = b*bar
        r = n(roots[ch])
        # Galloping bass: root root fifth root
        for i, step in enumerate([0, 0, 7, 0, 0, 0, 7, 12]):
            T.add('bass', t0 + i*e, pluck(midi(r + step), e*1.8, bright=0.35, decay=0.994), 0.6 if i % 2 == 0 else 0.42)
        # Drums: frame drum on 1, the "and" of 2, and 3; tambourine on eighths
        for beat_pos, amp in [(0, 1.0), (1.5, 0.6), (2, 0.85), (3.5, 0.5)]:
            T.add('drum', t0 + beat_pos*q, frame_drum(0.45, 90 if beat_pos in (0, 2) else 120), amp*0.85)
        for i in range(8):
            T.add('tamb', t0 + i*e, tamb(amp=0.22 if i % 2 else 0.12))
        if b % 4 == 3:
            for k in range(4):
                T.add('drum', t0 + 3*q + k*(q/4), frame_drum(0.25, 140), 0.45)
        # Rhythm strum on the off-beats
        tri = {'D': [62, 65, 69], 'Bb': [58, 62, 65], 'C': [60, 64, 67], 'F': [65, 69, 72], 'A': [57, 61, 64]}[ch]
        for beat_pos in (1, 3):
            for k, note in enumerate(tri):
                T.add('strum', t0 + beat_pos*q + k*0.012, pluck(midi(note), 0.5, bright=0.7, decay=0.99), 0.16)
    # Fiddle melody over bars 9-16
    mel = [
        (0, 'D5', 2), (2, 'F5', 2), (4, 'A5', 3), (7, 'G5', 1),
        (8, 'F5', 2), (10, 'E5', 2), (12, 'D5', 4),
        (16, 'D5', 2), (18, 'F5', 2), (20, 'G5', 2), (22, 'A5', 2),
        (24, 'Bb5', 3), (27, 'A5', 1), (28, 'G5', 4),
        (32, 'A5', 2), (34, 'C6', 2), (36, 'A5', 2), (38, 'G5', 2),
        (40, 'F5', 2), (42, 'E5', 2), (44, 'F5', 2), (46, 'G5', 2),
        (48, 'A5', 3), (51, 'G5', 1), (52, 'F5', 2), (54, 'E5', 2),
        (56, 'C#5', 4), (60, 'E5', 4),
    ]
    start = 8*bar
    for off, note, ln in mel:
        T.add('lead', start + off*e, fiddle(midi(n(note)), ln*e*0.95), 0.2)
    # First half: a lower answering line on the flute
    for off, note, ln in mel[:14]:
        T.add('lead', off*e, flute(midi(n(note)-12), ln*e*0.95), 0.16)
    return T.render(bars*bar, wet=0.18)

out = sys.argv[1]
write(f'{out}/menu.wav', menu())
write(f'{out}/battle.wav', battle())
print('ok')
