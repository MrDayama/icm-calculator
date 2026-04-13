/**
 * ICM Calculator Stable v1.1.0 (Legacy Stable Core)
 * Mathematics: Corrected ICM, Simple FGS Approximation
 */

function calculateICM(stacks, payouts) {
    const n = stacks.length;
    const actualPayouts = payouts.slice(0, n);
    const fullPayouts = [...actualPayouts, ...new Array(Math.max(0, n - actualPayouts.length)).fill(0)];
    const normStacks = stacks.map(s => Math.max(0.01, parseFloat(s) || 0));
    const cache = new Map();

    function computeEV(playerIndices, payoutIdx) {
        const key = playerIndices.sort((a,b)=>a-b).join(',') + '|' + payoutIdx;
        if (cache.has(key)) return cache.get(key);
        if (playerIndices.length === 0 || payoutIdx >= fullPayouts.length) return {};

        const totalStack = playerIndices.reduce((sum, i) => sum + normStacks[i], 0);
        const evs = {};
        playerIndices.forEach(p => {
            const prob = normStacks[p] / totalStack;
            const subRes = computeEV(playerIndices.filter(i => i !== p), payoutIdx + 1);
            evs[p] = prob * fullPayouts[payoutIdx];
            for (const q in subRes) evs[q] = (evs[q] || 0) + prob * subRes[q];
        });
        cache.set(key, evs);
        return evs;
    }
    return computeEV(Array.from({length:n},(_,i)=>i), 0);
}

function addPayout(v="") {
    const d = document.createElement('div'); d.className='input-row';
    d.innerHTML = `<input type="number" class="payout-input" value="${v}"><button class="btn-remove" onclick="this.parentElement.remove()">×</button>`;
    document.getElementById('payout-list').appendChild(d);
}

function addPlayer(n="", s="") {
    const d = document.createElement('div'); d.className='input-row';
    d.innerHTML = `<input type="text" class="player-name" value="${n}"><input type="number" class="player-stack" value="${s}"><button class="btn-remove" onclick="this.parentElement.remove()">×</button>`;
    document.getElementById('player-list').appendChild(d);
}

function calculate() {
    const p = Array.from(document.querySelectorAll('.payout-input')).map(i => parseFloat(i.value) || 0);
    const s = Array.from(document.querySelectorAll('.player-stack')).map(i => parseFloat(i.value) || 0);
    const res = calculateICM(s, p);
    const list = document.getElementById('result-list');
    list.innerHTML = '';
    
    const names = Array.from(document.querySelectorAll('.player-name')).map((v, i) => v.value || `Player ${i+1}`);

    for (const i in res) {
        const card = document.createElement('div'); card.className = 'res-card';
        card.innerHTML = `<div class="res-player">${names[i]}</div><div class="res-ev">${res[i].toFixed(2)}</div>`;
        list.appendChild(card);
    }
    document.getElementById('results-display').classList.remove('hidden');
}

window.onload = () => {
    [50, 30, 20].forEach(v => addPayout(v));
    ["P1", "P2", "P3"].forEach((n, i) => addPlayer(n, [100, 50, 20][i]));
};
