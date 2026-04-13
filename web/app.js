/** 
 * ICM Calculator (v1.8.0 Pure Edition)
 * Rolling back to Today's First Stable Version. Range Analyzer Removed.
 */

const RANKS = 'AKQJT98765432';

// --- ICM Engine ---
function calculateICM(stacks, payouts) {
    const n = stacks.length;
    if (n === 0) return [];
    const actualPayouts = payouts.slice(0, n);
    const fullPayouts = [...actualPayouts, ...new Array(Math.max(0, n - actualPayouts.length)).fill(0)];
    const normStacks = stacks.map(s => Math.max(0.1, parseFloat(s) || 0));
    const cache = new Map();

    function computePrizeEVs(playerIndices, payoutIdx) {
        const sortedIndices = [...playerIndices].sort((a, b) => a - b);
        const key = sortedIndices.join(',') + '|' + payoutIdx;
        if (cache.has(key)) return cache.get(key);

        const currentNumPlayers = playerIndices.length;
        if (currentNumPlayers === 0 || payoutIdx >= fullPayouts.length) return {};

        if (currentNumPlayers === 1) {
            const idx = playerIndices[0];
            let sum = 0;
            for (let i = payoutIdx; i < fullPayouts.length; i++) sum += (fullPayouts[i] || 0);
            return { [idx]: sum };
        }

        const subsetTotal = playerIndices.reduce((s, i) => s + normStacks[i], 0);
        const evs = {};
        playerIndices.forEach(idx => evs[idx] = 0);
        if (subsetTotal <= 0) return evs;

        const currentPrizeValue = fullPayouts[payoutIdx] || 0;
        playerIndices.forEach(p => {
            const probWinsThisPlace = normStacks[p] / subsetTotal;
            const remainingPlayers = playerIndices.filter(i => i !== p);
            const subRes = computePrizeEVs(remainingPlayers, payoutIdx + 1);
            evs[p] += probWinsThisPlace * currentPrizeValue;
            for (const q in subRes) evs[q] += probWinsThisPlace * subRes[q];
        });

        cache.set(key, evs);
        return evs;
    }

    const allIndices = Array.from({length: n}, (_, i) => i);
    const resultDict = computePrizeEVs(allIndices, 0);
    return allIndices.map(i => resultDict[i] || 0);
}

function calculateBF(stacks, payouts, heroIdx, villainIdx) {
    if (heroIdx === villainIdx) return 1.0;
    const evsNow = calculateICM(stacks, payouts);
    const evNow = evsNow[heroIdx];
    const risk = Math.min(stacks[heroIdx], stacks[villainIdx]);
    const ws = [...stacks]; ws[heroIdx] += risk; ws[villainIdx] -= risk;
    const evWin = calculateICM(ws, payouts)[heroIdx];
    const ls = [...stacks]; ls[heroIdx] -= risk; ls[villainIdx] += risk;
    const evLose = calculateICM(ls, payouts)[heroIdx];
    const reward = evWin - evNow;
    const cost = evNow - evLose;
    if (reward <= 0) return 9.99;
    return cost / reward;
}

// --- UI Logic ---
document.addEventListener('DOMContentLoaded', () => {
    const pList = document.getElementById('payout-list');
    const playerList = document.getElementById('player-list');
    const resultList = document.getElementById('result-list');
    const resultsDisplay = document.getElementById('results-display');
    const calcBtn = document.getElementById('calc-btn');

    function createRow(list, type, val = "", sVal = "") {
        const div = document.createElement('div'); div.className = 'input-row';
        div.innerHTML = type === 'player' ? 
            `<input type="text" class="player-name" value="${val}"><input type="number" class="player-stack" value="${sVal}"><button class="btn-remove">×</button>` : 
            `<label>賞金</label><input type="number" class="payout-input" value="${val}"><button class="btn-remove">×</button>`;
        div.querySelector('.btn-remove').onclick = () => div.remove();
        list.appendChild(div);
    }

    // 初期設定
    [50, 31, 19].forEach(v => createRow(pList, 'payout', v));
    [100, 80, 50, 30, 20].forEach((s, i) => createRow(playerList, 'player', `P${i+1}`, s));

    document.getElementById('add-payout').onclick = () => createRow(pList, 'payout');
    document.getElementById('add-player').onclick = () => createRow(playerList, 'player');

    calcBtn.onclick = () => {
        const payouts = Array.from(document.querySelectorAll('.payout-input')).map(i => parseFloat(i.value) || 0);
        const stacks = Array.from(document.querySelectorAll('.player-stack')).map(i => parseFloat(i.value) || 0);
        const names = Array.from(document.querySelectorAll('.player-name')).map((v, i) => v.value || `P${i+1}`);

        const results = calculateICM(stacks, payouts);
        resultList.innerHTML = '';
        results.forEach((ev, i) => {
            let bfs = [];
            stacks.forEach((sj, j) => {
                if (i !== j && stacks[i] > 0 && stacks[j] > 0) {
                    const bf = calculateBF(stacks, payouts, i, j);
                    bfs.push({ name: names[j], val: bf.toFixed(2), re: (bf / (1 + bf) * 100).toFixed(1) });
                }
            });
            const card = document.createElement('div'); card.className = 'res-card';
            card.innerHTML = `
                <div class="res-card-main">
                    <div>
                        <div class="res-player">${names[i]}</div>
                        <div class="res-risk">Risk Factor: ${(i+1 / (stacks[i]/1.5 || 0.1)).toFixed(1)}</div>
                    </div>
                    <div class="res-ev">${ev.toFixed(2)}</div>
                </div>
                <div class="res-bf-details">
                    ${bfs.map(b => `<div class="bf-row">vs ${b.name}: <strong>${b.val}</strong> <span class="bf-re">RE: ${b.re}%</span></div>`).join('')}
                </div>
            `;
            resultList.appendChild(card);
        });
        resultsDisplay.classList.remove('hidden');
        resultsDisplay.scrollIntoView({ behavior: 'smooth' });
    };
});
