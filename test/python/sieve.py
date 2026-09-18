n = 2000
flags = [True] * (n + 1)
flags[0] = False
flags[1] = False
i = 2
while i * i <= n:
    if flags[i]:
        j = i * i
        while j <= n:
            flags[j] = False
            j += i
    i += 1
primes = [k for k in range(n + 1) if flags[k]]
print(len(primes), primes[:10], primes[-1])
words = "the quick brown fox jumps over the lazy dog the end".split()
counts = {}
for w in words:
    counts[w] = counts.get(w, 0) + 1
print(sorted(counts.keys()), counts["the"])
