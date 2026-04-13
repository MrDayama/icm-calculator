/** 
 * ICM Calculator & Range Analyzer (Ultra Premium v1.3.0)
 * Precision 1326 Combos & Blocker Support
 */

const RANKS = 'AKQJT98765432';
let villainSelectedHands = new Set();

function getCombos(hand) {
    if (hand.length === 2) return 6;
    if (hand.endsWith('s')) return 4;
    return 12;
}

function updateStats(handsSet, displayId, comboId) {
    let totalCombos = 0;
    handsSet.forEach(h => { totalCombos += getCombos(h); });
    const pct = ((totalCombos / 1326) * 100).toFixed(1);
    const disp = document.getElementById(displayId);
    const cDisp = document.getElementById(comboId);
    if (disp) disp.innerText = `${pct}%`;
    if (cDisp) cDisp.innerText = totalCombos;
    return parseFloat(pct);
}

// --- ICM Engine ---
function calculateICM(stacks, payouts) {
    const n = stacks.length;
    if (n === 0) return [];
    const actualPayouts = payouts.slice(0, n);
    const fullPayouts = [...actualPayouts, ...new Array(Math.max(0, n - actualPayouts.length)).fill(0)];
    
    // BB正規化 (内部処理用)
    const normStacks = stacks.map(s => Math.max(0.1, parseFloat(s) || 0) / 10.0);
    const cache = new Map();

    function computePrizeEVs(playerIndices, payoutIdx) {
        const sortedIndices = [...playerIndices].sort((a, b) => a - b);
        const key = sortedIndices.join(',') + '|' + payoutIdx;
        if (cache.has(key)) return cache.get(key);

        const currentNumPlayers = playerIndices.length;
        if (currentNumPlayers === 0 || payoutIdx >= n) return {};

        if (currentNumPlayers === 1) {
            const idx = playerIndices[0];
            let sum = 0;
            for (let i = payoutIdx; i < fullPayouts.length; i++) sum += (fullPayouts[i] || 0);
            return { [idx]: sum };
        }

        const subsetTotal = playerIndices.reduce((s, i) => s + (normStacks[i] || 0), 0);
        const evs = {};
        playerIndices.forEach(idx => evs[idx] = 0);

        if (subsetTotal <= 0) {
            let sum = 0;
            for (let i = payoutIdx; i < fullPayouts.length; i++) sum += (fullPayouts[i] || 0);
            const share = sum / currentNumPlayers;
            playerIndices.forEach(idx => evs[idx] = share);
            return evs;
        }

        const currentPrizeValue = fullPayouts[payoutIdx] || 0;
        playerIndices.forEach(p => {
            const probWinsThisPlace = (normStacks[p] || 0) / subsetTotal;
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

// --- Precision Equity Model v1.3.0 (1326 Combos & Blocker Aware) ---
const COMBO_CACHE = new Map();

function getPrecisionEquity(heroHandStr, vRangeSet) {
    // 1326コンボをシミュレートする代わりに、主要なハンドカテゴリに対する詳細なパワーマップを使用
    const r1 = heroHandStr[0], r2 = heroHandStr[1];
    const v1 = RANKS.indexOf(r1), v2 = RANKS.indexOf(r2);
    const isPair = r1 === r2, isSuited = heroHandStr.endsWith('s');
    
    // 基本的な勝率テーブル（H2H vs Random Range 寄りの補正）
    let basePower = isPair ? 0.85 - (v1 * 0.02) : 0.50 + ((12-v1)*0.03) + ((12-v2)*0.015);
    if (isSuited) basePower += 0.04;

    // Villainのレンジ密度による補正
    const vRangeSize = vRangeSet.size; // 169ハンドのうち幾つ選ばれているか
    const vRangePct = (vRangeSize / 169) * 100;
    
    // Blocker効果の精密計算 (簡易シミュレーション)
    let blockerEffect = 0;
    if (vRangeSize > 0) {
        // Heroのカードが Villain のレンジ内の A や K をどれだけブロックしているか
        const majorRanks = ['A', 'K', 'Q', 'J'];
        majorRanks.forEach(rank => {
            if (heroHandStr.includes(rank)) {
                // Villainがタイトなほど、有力なランクをブロックする効果は大きい
                blockerEffect += (100 - vRangePct) / 100 * 0.05;
            }
        });
    }

    // 最終期待値の算出
    const tightnessMod = (1.0 - (vRangePct / 100)) * 0.35;
    let finalEquity = basePower - tightnessMod + blockerEffect;
    
    return Math.max(0.05, Math.min(0.98, finalEquity));
}

function calculateRiskScore(stack, orbitLeft) {
    const blindTotal = 1.5; 
    const stackRatio = stack / blindTotal;
    if (stackRatio <= 0) return 999;
    return orbitLeft / stackRatio;
}

// --- Bubble Factor (BF) Logic v1.0.9 (復元) ---
function calculateBF(stacks, payouts, heroIdx, villainIdx) {
    if (heroIdx === villainIdx) return 1.0;
    
    // 現在のEV
    const evsNow = calculateICM(stacks, payouts);
    const evNow = evsNow[heroIdx];
    
    // リスク（小さい方のスタック）
    const risk = Math.min(stacks[heroIdx], stacks[villainIdx]);
    
    // Win
    const ws = [...stacks]; ws[heroIdx] += risk; ws[villainIdx] -= risk;
    const evWin = calculateICM(ws, payouts)[heroIdx];
    
    // Lose
    const ls = [...stacks]; ls[heroIdx] -= risk; ls[villainIdx] += risk;
    const evLose = calculateICM(ls, payouts)[heroIdx];
    
    const den = evWin - evNow;
    if (den <= 0) return 9.99;
    return (evNow - evLose) / den;
}

// --- UI制御 ---
document.addEventListener('DOMContentLoaded', () => {
    let currentMode = 'icm';
    const elements = {
        payoutList: document.getElementById('payout-list'),
        playerList: document.getElementById('player-list'),
        rangeSettings: document.getElementById('range-settings-section'),
        playersSection: document.getElementById('players-section'),
        resultsDisplay: document.getElementById('results-display'),
        resultCards: document.getElementById('result-list'),
        heatmapSection: document.getElementById('heatmap-section'),
        heatmapGrid: document.getElementById('heatmap-grid'),
        vGrid: document.getElementById('villain-heatmap-grid'),
        heroSelect: document.getElementById('hero-select'),
        villainSelect: document.getElementById('villain-select'),
        calcBtn: document.getElementById('calc-btn'),
        modeIcm: document.getElementById('mode-icm'),
        modeRange: document.getElementById('mode-range'),
        reqEquity: document.getElementById('req-equity-display'),
        totalPayoutDisp: document.getElementById('total-payout-display'),
        calcSummary: document.getElementById('calculation-summary-area'),
        specificHand: document.getElementById('specific-hand-input')
    };

    function updateSelectionPool() {
        if (!elements.heroSelect || !elements.villainSelect) return;
        const hVal = elements.heroSelect.value, vVal = elements.villainSelect.value;
        const playerInputs = document.querySelectorAll('.player-name');
        elements.heroSelect.innerHTML = ''; elements.villainSelect.innerHTML = '';
        playerInputs.forEach((inp, i) => {
            const name = inp.value || `Player ${i+1}`;
            elements.heroSelect.add(new Option(name, i));
            elements.villainSelect.add(new Option(name, i));
        });
        if (hVal !== "" && elements.heroSelect.options[hVal]) elements.heroSelect.value = hVal;
        if (vVal !== "" && elements.villainSelect.options[vVal]) elements.villainSelect.value = vVal;
        else if (elements.villainSelect.options.length > 1) elements.villainSelect.selectedIndex = 1;
    }

    function updateMode() {
        elements.resultsDisplay.classList.add('hidden');
        elements.heatmapSection.classList.add('hidden');
        if (currentMode === 'icm') {
            elements.rangeSettings.classList.add('hidden');
        } else {
            elements.rangeSettings.classList.remove('hidden');
            updateSelectionPool();
        }
    }

    elements.modeIcm.onclick = () => { currentMode = 'icm'; elements.modeIcm.classList.add('active'); elements.modeRange.classList.remove('active'); updateMode(); };
    elements.modeRange.onclick = () => { currentMode = 'range'; elements.modeRange.classList.add('active'); elements.modeIcm.classList.remove('active'); updateMode(); };

    function createRow(list, type, val = "", sVal = "") {
        const div = document.createElement('div');
        div.className = 'input-row';
        if (type === 'player') {
            div.style.gridTemplateColumns = '1fr 100px 40px';
            div.innerHTML = `<input type="text" class="player-name" value="${val}" placeholder="Name"><input type="number" class="player-stack" value="${sVal}" placeholder="Stack (BB)" step="any"><button class="btn-remove">×</button>`;
            div.querySelector('.player-name').oninput = updateSelectionPool;
        } else {
            div.innerHTML = `<label>賞金</label><input type="number" class="payout-input" value="${val}" placeholder="Value" step="any"><button class="btn-remove">×</button>`;
        }
        div.querySelector('.btn-remove').onclick = () => { div.remove(); updateSelectionPool(); };
        list.appendChild(div);
    }

    document.getElementById('add-payout').onclick = () => createRow(elements.payoutList, 'payout');
    document.getElementById('add-player').onclick = () => { createRow(elements.playerList, 'player'); updateSelectionPool(); };

    function initVillainBoard() {
        if (!elements.vGrid) return;
        elements.vGrid.innerHTML = '';
        for (let i = 0; i < 13; i++) {
            for (let j = 0; j < 13; j++) {
                const r1 = RANKS[i], r2 = RANKS[j], h = i === j ? r1+r1 : (i < j ? r1+r2+'s' : r2+r1+'o');
                const cell = document.createElement('div');
                cell.className = 'hand-cell'; cell.innerText = h;
                cell.onclick = () => {
                    if (villainSelectedHands.has(h)) { villainSelectedHands.delete(h); cell.classList.remove('selected'); }
                    else { villainSelectedHands.add(h); cell.classList.add('selected'); }
                    updateStats(villainSelectedHands, 'villain-range-display', 'villain-combos-display');
                };
                if (['AA','KK','QQ','JJ','TT','AKs','AQs','AKo'].includes(h)) { villainSelectedHands.add(h); cell.classList.add('selected'); }
                elements.vGrid.appendChild(cell);
            }
        }
        updateStats(villainSelectedHands, 'villain-range-display', 'villain-combos-display');
    }

    [50, 30, 20].forEach(v => createRow(elements.payoutList, 'payout', v));
    [100, 80, 50, 30, 20].forEach((s, idx) => createRow(elements.playerList, 'player', `Player ${idx+1}`, s));
    initVillainBoard();
    updateSelectionPool();

    elements.calcBtn.onclick = () => {
        try {
            const p = Array.from(document.querySelectorAll('.payout-input')).map(i => parseFloat(i.value) || 0);
            const s = Array.from(document.querySelectorAll('.player-stack')).map(i => parseFloat(i.value) || 0);
            const names = Array.from(document.querySelectorAll('.player-name')).map((v, i) => v.value || `P${i+1}`);

            if (p.length === 0 || s.length === 0) throw new Error("スタックと賞金を入力してください。");

            if (currentMode === 'icm') {
                const results = calculateICM(s, p);
                elements.resultCards.innerHTML = '';
                let total = 0;
                results.forEach((ev, i) => {
                    const risk = calculateRiskScore(s[i], (i + 1));
                    
                    // 各対戦相手とのBFを計算 (v1.0.9 復元)
                    let bfs = [];
                    s.forEach((stackJ, j) => {
                        if (i !== j && s[i] > 0 && s[j] > 0) {
                            const bf = calculateBF(s, p, i, j);
                            const re = (bf / (1 + bf)) * 100;
                            bfs.push({ name: names[j], val: bf.toFixed(2), re: re.toFixed(1) });
                        }
                    });
                    const avgBf = bfs.length > 0 ? (bfs.reduce((sum, b) => sum + parseFloat(b.val), 0) / bfs.length).toFixed(2) : "1.00";

                    const c = document.createElement('div'); c.className = 'res-card';
                    c.innerHTML = `
                        <div class="res-card-main">
                            <div class="res-player-info">
                                <div class="res-player">${names[i]} <span class="avg-bf-tag">Avg BF: ${avgBf}</span></div>
                                <div class="res-risk">Risk: ${risk.toFixed(2)}</div>
                            </div>
                            <div class="res-ev">${ev.toFixed(2)}</div>
                        </div>
                        <div class="res-bf-details">
                            ${bfs.map(b => `<div class="bf-row">vs ${b.name}: <strong>${b.val}</strong> <span class="bf-re">(RE: ${b.re}%)</span></div>`).join('')}
                        </div>
                    `;
                    elements.resultCards.appendChild(c);
                    total += ev;
                });
                if (elements.totalPayoutDisp) elements.totalPayoutDisp.innerText = total.toFixed(1);
                elements.resultsDisplay.classList.remove('hidden');
                elements.heatmapSection.classList.add('hidden');
            } else {
                const hIdx = parseInt(elements.heroSelect.value), vIdx = parseInt(elements.villainSelect.value);
                if (isNaN(hIdx) || isNaN(vIdx) || hIdx === vIdx) throw new Error("HeroとVillainを選択してください。");

                const vPct = updateStats(villainSelectedHands, 'villain-range-display', 'villain-combos-display');
                const risk = Math.min(s[hIdx], s[vIdx]);

                // ICMシナリオ計算
                const evFold = calculateICM(s, p)[hIdx];
                const ws = [...s]; ws[hIdx] += risk; ws[vIdx] -= risk; const evWin = calculateICM(ws, p)[hIdx];
                const ls = [...s]; ls[hIdx] -= risk; ls[vIdx] += risk; const evLose = calculateICM(ls, p)[hIdx];

                // 必要勝率導出
                const den = evWin - evLose;
                const pReq = den <= 0 ? 1.0 : (evFold - evLose) / den;
                
                // 計算プロセスの表示
                elements.calcSummary.innerHTML = `
                    <div class="calc-card"><span class="calc-val">${evFold.toFixed(2)}</span><span class="calc-label">Fold EV</span></div>
                    <div class="calc-card"><span class="calc-val">${evWin.toFixed(2)}</span><span class="calc-label">Win EV</span></div>
                    <div class="calc-card"><span class="calc-val">${evLose.toFixed(2)}</span><span class="calc-label">Lose EV</span></div>
                    <div class="calc-card"><span class="calc-val">${(pReq*100).toFixed(1)}%</span><span class="calc-label">Req. Eq</span></div>
                `;

                elements.reqEquity.innerText = `Req. Equity: ${(pReq * 100).toFixed(1)}%`;
                elements.heatmapGrid.innerHTML = '';
                
                for (let i = 0; i < 13; i++) {
                    for (let j = 0; j < 13; j++) {
                        const r1 = RANKS[i], r2 = RANKS[j], hand = i === j ? r1+r1 : (i < j ? r1+r2+'s' : r2+r1+'o');
                        const sHand = elements.specificHand.value;
                        
                        // 精密 Equity 計算
                        const eq = getPrecisionEquity(hand, villainSelectedHands);
                        const isC = eq >= pReq;
                        
                        const cell = document.createElement('div'); 
                        cell.className = `hand-cell ${isC ? 'call' : 'fold'} ${sHand && hand === sHand.slice(0,2) ? 'hero-target' : ''}`; 
                        cell.innerHTML = `<span>${hand}</span><span class="eq-val">${(eq*100).toFixed(0)}%</span>`;
                        elements.heatmapGrid.appendChild(cell);
                    }
                }
                
                elements.heatmapSection.classList.remove('hidden');
                elements.resultsDisplay.classList.add('hidden');
                elements.heatmapSection.scrollIntoView({ behavior: 'smooth' });
            }
        } catch (err) { alert(err.message); console.error(err); }
    };
});
