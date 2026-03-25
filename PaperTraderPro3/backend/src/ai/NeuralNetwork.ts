/**
 * Neural Network Engine — Pure TypeScript
 * Implements LSTM, TCN, and a Transformer-style attention model
 * without any external ML library dependency.
 * These run entirely on the backend in Node.js.
 */

// ── Math utilities ──────────────────────────────────────────────
function sigmoid(x: number): number { return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, x)))) }
function tanh(x: number): number { return Math.tanh(x) }
function relu(x: number): number { return Math.max(0, x) }
function softmax(arr: number[]): number[] {
  const max = Math.max(...arr)
  const exp = arr.map(v => Math.exp(v - max))
  const sum = exp.reduce((a, b) => a + b, 0)
  return exp.map(v => v / (sum || 1))
}
function dot(a: number[], b: number[]): number {
  return a.reduce((s, v, i) => s + v * b[i], 0)
}
function matMul(A: number[][], B: number[][]): number[][] {
  const rows = A.length, cols = B[0].length, inner = B.length
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) =>
      Array.from({ length: inner }, (_, k) => A[r][k] * B[k][c]).reduce((a, b) => a + b, 0)
    )
  )
}
function layerNorm(x: number[], eps = 1e-5): number[] {
  const mean = x.reduce((a, b) => a + b, 0) / x.length
  const variance = x.reduce((s, v) => s + (v - mean) ** 2, 0) / x.length
  return x.map(v => (v - mean) / Math.sqrt(variance + eps))
}
function dropout(x: number[], rate: number, training = false): number[] {
  if (!training || rate === 0) return x
  return x.map(v => Math.random() > rate ? v / (1 - rate) : 0)
}

// ── Weight initialisation (Xavier uniform) ──────────────────────
function xavierInit(fanIn: number, fanOut: number): number {
  const limit = Math.sqrt(6 / (fanIn + fanOut))
  return (Math.random() * 2 - 1) * limit
}
function initMatrix(rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => xavierInit(rows, cols))
  )
}
function initVec(size: number, val = 0): number[] {
  return new Array(size).fill(val)
}

// ═══════════════════════════════════════════════════════════════
//  LSTM CELL
// ═══════════════════════════════════════════════════════════════
export interface LSTMWeights {
  Wf: number[][]; Uf: number[][]; bf: number[]   // forget gate
  Wi: number[][]; Ui: number[][]; bi: number[]   // input gate
  Wc: number[][]; Uc: number[][]; bc: number[]   // cell gate
  Wo: number[][]; Uo: number[][]; bo: number[]   // output gate
  Wy: number[][]; by: number[]                   // output projection
}

export function initLSTMWeights(inputSize: number, hiddenSize: number, outputSize: number): LSTMWeights {
  return {
    Wf: initMatrix(hiddenSize, inputSize),  Uf: initMatrix(hiddenSize, hiddenSize), bf: initVec(hiddenSize),
    Wi: initMatrix(hiddenSize, inputSize),  Ui: initMatrix(hiddenSize, hiddenSize), bi: initVec(hiddenSize),
    Wc: initMatrix(hiddenSize, inputSize),  Uc: initMatrix(hiddenSize, hiddenSize), bc: initVec(hiddenSize),
    Wo: initMatrix(hiddenSize, inputSize),  Uo: initMatrix(hiddenSize, hiddenSize), bo: initVec(hiddenSize),
    Wy: initMatrix(outputSize, hiddenSize), by: initVec(outputSize),
  }
}

function lstmStep(x: number[], h: number[], c: number[], W: LSTMWeights): { h: number[]; c: number[] } {
  const H = h.length
  const gate = (Wg: number[][], Ug: number[][], bg: number[], activFn: (v: number) => number) =>
    Array.from({ length: H }, (_, i) => activFn(dot(Wg[i], x) + dot(Ug[i], h) + bg[i]))

  const f  = gate(W.Wf, W.Uf, W.bf, sigmoid)
  const ig = gate(W.Wi, W.Ui, W.bi, sigmoid)
  const cg = gate(W.Wc, W.Uc, W.bc, tanh)
  const og = gate(W.Wo, W.Uo, W.bo, sigmoid)

  const newC = c.map((cv, i) => f[i] * cv + ig[i] * cg[i])
  const newH = newC.map((cv, i) => og[i] * tanh(cv))
  return { h: newH, c: newC }
}

export function lstmForward(
  sequence: number[][],
  weights: LSTMWeights,
  hiddenSize: number
): number[] {
  let h = initVec(hiddenSize)
  let c = initVec(hiddenSize)
  for (const x of sequence) {
    const res = lstmStep(x, h, c, weights)
    h = res.h; c = res.c
  }
  // Output projection
  const H = weights.Wy.length
  return Array.from({ length: H }, (_, i) => dot(weights.Wy[i], h) + weights.by[i])
}

// ═══════════════════════════════════════════════════════════════
//  TEMPORAL CONVOLUTIONAL NETWORK (TCN)
// ═══════════════════════════════════════════════════════════════
export interface TCNWeights {
  layers: Array<{
    kernels: number[][]   // [outChannels × kernelSize]
    bias: number[]
    residual?: number[][] // optional residual projection
  }>
  outputW: number[][]
  outputB: number[]
}

export function initTCNWeights(inputSize: number, channels: number, kernelSize: number, numLayers: number, outputSize: number): TCNWeights {
  const layers = Array.from({ length: numLayers }, (_, l) => {
    const inC = l === 0 ? inputSize : channels
    return {
      kernels: initMatrix(channels, inC * kernelSize),
      bias:    initVec(channels),
      residual: inC !== channels ? initMatrix(channels, inC) : undefined,
    }
  })
  return { layers, outputW: initMatrix(outputSize, channels), outputB: initVec(outputSize) }
}

function dilatedConv1d(
  input: number[][],  // [seqLen × channels]
  kernel: number[][], // [outChannels × inChannels*kernelSize]
  bias: number[],
  kernelSize: number,
  dilation: number
): number[][] {
  const seqLen = input.length
  const outChannels = kernel.length
  const inChannels = input[0]?.length ?? 1
  const result: number[][] = []

  for (let t = 0; t < seqLen; t++) {
    const out: number[] = new Array(outChannels).fill(0)
    for (let oc = 0; oc < outChannels; oc++) {
      let sum = bias[oc]
      for (let k = 0; k < kernelSize; k++) {
        const tIdx = t - k * dilation
        if (tIdx >= 0 && tIdx < seqLen) {
          for (let ic = 0; ic < inChannels; ic++) {
            sum += input[tIdx][ic] * kernel[oc][k * inChannels + ic]
          }
        }
      }
      out[oc] = relu(sum)
    }
    result.push(out)
  }
  return result
}

export function tcnForward(sequence: number[][], weights: TCNWeights): number[] {
  let current = sequence  // [seqLen × inputSize]
  const numLayers = weights.layers.length
  const kernelSize = 3

  for (let l = 0; l < numLayers; l++) {
    const dilation = Math.pow(2, l)
    const { kernels, bias, residual } = weights.layers[l]
    const conv = dilatedConv1d(current, kernels, bias, kernelSize, dilation)

    // Residual connection
    const inC = current[0]?.length ?? 1
    const outC = conv[0]?.length ?? 1
    const withRes = conv.map((v, t) => {
      if (residual) {
        const res = Array.from({ length: outC }, (_, i) =>
          dot(residual[i], current[t] ?? [])
        )
        return v.map((val, i) => val + res[i])
      }
      if (inC === outC) return v.map((val, i) => val + (current[t]?.[i] ?? 0))
      return v
    })
    current = withRes.map(v => layerNorm(v))
  }

  // Global average pooling
  const seqLen = current.length, channels = current[0]?.length ?? 1
  const pooled = Array.from({ length: channels }, (_, c) =>
    current.reduce((s, t) => s + (t[c] ?? 0), 0) / seqLen
  )

  // Output
  return Array.from({ length: weights.outputW.length }, (_, i) =>
    relu(dot(weights.outputW[i], pooled) + weights.outputB[i])
  )
}

// ═══════════════════════════════════════════════════════════════
//  TRANSFORMER (Scaled Dot-Product Attention)
// ═══════════════════════════════════════════════════════════════
export interface TransformerWeights {
  WQ: number[][]; WK: number[][]; WV: number[][]  // attention projections
  WO: number[][]                                   // output projection
  FF1: number[][]; b1: number[]                    // feed-forward layer 1
  FF2: number[][]; b2: number[]                    // feed-forward layer 2
  outputW: number[][]; outputB: number[]
}

export function initTransformerWeights(dModel: number, dFF: number, outputSize: number): TransformerWeights {
  return {
    WQ: initMatrix(dModel, dModel), WK: initMatrix(dModel, dModel), WV: initMatrix(dModel, dModel),
    WO: initMatrix(dModel, dModel),
    FF1: initMatrix(dFF, dModel), b1: initVec(dFF),
    FF2: initMatrix(dModel, dFF), b2: initVec(dModel),
    outputW: initMatrix(outputSize, dModel), outputB: initVec(outputSize),
  }
}

function scaledDotAttention(Q: number[][], K: number[][], V: number[][], scale: number): number[][] {
  const seqLen = Q.length, dK = Q[0]?.length ?? 1
  const scores = Q.map(q => K.map(k => dot(q, k) / scale))
  const attnWeights = scores.map(row => softmax(row))
  return attnWeights.map(row =>
    Array.from({ length: V[0]?.length ?? 1 }, (_, j) =>
      row.reduce((s, w, t) => s + w * (V[t]?.[j] ?? 0), 0)
    )
  )
}

function projectSeq(seq: number[][], W: number[][]): number[][] {
  return seq.map(x => Array.from({ length: W.length }, (_, i) => dot(W[i], x)))
}

export function transformerForward(sequence: number[][], weights: TransformerWeights): number[] {
  const dModel = weights.WQ.length
  const scale  = Math.sqrt(dModel)

  // Positional encoding (simple sinusoidal)
  const posEncoded = sequence.map((x, pos) =>
    x.map((v, i) => v + (i % 2 === 0 ? Math.sin(pos / Math.pow(10000, i / dModel)) : Math.cos(pos / Math.pow(10000, (i - 1) / dModel))))
  )

  // Self-attention
  const Q = projectSeq(posEncoded, weights.WQ)
  const K = projectSeq(posEncoded, weights.WK)
  const V = projectSeq(posEncoded, weights.WV)
  const attended = scaledDotAttention(Q, K, V, scale)
  const projected = attended.map(x => Array.from({ length: dModel }, (_, i) => dot(weights.WO[i], x)))

  // Add & norm
  const normed1 = projected.map((x, t) => layerNorm(x.map((v, i) => v + (posEncoded[t]?.[i] ?? 0))))

  // Feed-forward
  const ff = normed1.map(x => {
    const h = Array.from({ length: weights.FF1.length }, (_, i) => relu(dot(weights.FF1[i], x) + weights.b1[i]))
    const out = Array.from({ length: weights.FF2.length }, (_, i) => dot(weights.FF2[i], h) + weights.b2[i])
    return layerNorm(out.map((v, i) => v + (x[i] ?? 0)))
  })

  // Mean pooling → output
  const meanPool = Array.from({ length: dModel }, (_, i) =>
    ff.reduce((s, t) => s + (t[i] ?? 0), 0) / ff.length
  )
  return Array.from({ length: weights.outputW.length }, (_, i) =>
    dot(weights.outputW[i], meanPool) + weights.outputB[i]
  )
}
