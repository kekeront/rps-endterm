"use client";
import { useState, useEffect } from "react";
import { ethers } from "ethers";

// --- Вставьте адрес вашего контракта ---
const CONTRACT_ADDRESS = "0xdC3151902D69B485cDb9A1A289583562D7356821";

// ABI ваш контракт
const ABI = [
  {
    "inputs": [],
    "stateMutability": "payable",
    "type": "constructor"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "depositor",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "FundsDeposited",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "player",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "enum RockPaperScissors.Choice",
        "name": "playerChoice",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "enum RockPaperScissors.Choice",
        "name": "computerChoice",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "enum RockPaperScissors.GameResult",
        "name": "result",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "betAmount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "payout",
        "type": "uint256"
      }
    ],
    "name": "GamePlayed",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "MIN_BET",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "depositFunds",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getContractBalance",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getMinimumBet",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "enum RockPaperScissors.Choice",
        "name": "_playerChoice",
        "type": "uint8"
      }
    ],
    "name": "playGame",
    "outputs": [
      {
        "internalType": "enum RockPaperScissors.GameResult",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_amount",
        "type": "uint256"
      }
    ],
    "name": "withdrawFunds",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "stateMutability": "payable",
    "type": "receive"
  }
];

const BSC_TESTNET_PARAMS = {
  chainId: "0x61",
  chainName: "BNB Smart Chain Testnet",
  nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: ["https://data-seed-prebsc-1-s1.binance.org:8545/"],
  blockExplorerUrls: ["https://testnet.bscscan.com"]
};

export default function Home() {
  const [accounts, setAccounts] = useState<string[]>([]);
  const [contract, setContract] = useState<any>(null);
  const [status, setStatus] = useState("Connect wallet to play (Min bet: 0.0001 tBNB)");
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [contractBalance, setContractBalance] = useState("0");
  const [lastTxHash, setLastTxHash] = useState("");
  const [stats, setStats] = useState({ wins: 0, draws: 0, losses: 0 });

  const connectWallet = async () => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      try {
        const provider = new ethers.BrowserProvider((window as any).ethereum);

        try {
          await (window as any).ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: BSC_TESTNET_PARAMS.chainId }],
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            await (window as any).ethereum.request({
              method: "wallet_addEthereumChain",
              params: [BSC_TESTNET_PARAMS],
            });
          }
        }

        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        setAccounts([address]);

        const rpsContract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
        setContract(rpsContract);
        setStatus("Connected! Ready to bet 0.0001 tBNB.");

        await updateBalance(rpsContract);
        await loadStats(rpsContract, provider, address);
        // Don't load history on connect to avoid RPC limits
        // await loadHistory(rpsContract, provider);

      } catch (err) {
        console.error(err);
        alert("Connection failed");
      }
    } else {
      alert("Please install MetaMask!");
    }
  };

  const updateBalance = async (contractInstance: any) => {
    try {
      const bal = await contractInstance.getContractBalance();
      setContractBalance(ethers.formatEther(bal));
    } catch (e) { console.log(e); }
  }

  const loadStats = async (contractInstance: any, provider: any, playerAddress: string) => {
    try {
      // Try to get last 500 blocks to calculate stats
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 500);
      
      const filter = contractInstance.filters.GamePlayed(playerAddress);
      const events = await Promise.race([
        contractInstance.queryFilter(filter, fromBlock, "latest"),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3000))
      ]) as any[];

      let wins = 0, draws = 0, losses = 0;
      
      events.forEach((event: any) => {
        const result = Number(event.args[3]); // GameResult enum: 0=Lose, 1=Draw, 2=Win
        if (result === 2) wins++;
        else if (result === 1) draws++;
        else if (result === 0) losses++;
      });

      setStats({ wins, draws, losses });
    } catch (err) {
      console.log("Could not load stats (using cached)");
      // Keep existing stats if load fails
    }
  };

  // --- ИСПРАВЛЕННАЯ ФУНКЦИЯ ---
  const loadHistory = async (contractInstance: any, provider: any) => {
    try {
      const currentBlock = await provider.getBlockNumber();

      // Минимальный диапазон для избежания RPC limit
      const range = 50;
      const fromBlock = currentBlock - range > 0 ? currentBlock - range : 0;

      // Получаем логи с таймаутом
      const filter = contractInstance.filters.GamePlayed();
      const events = await Promise.race([
        contractInstance.queryFilter(filter, fromBlock, "latest"),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000))
      ]);

      const formatted = (events as any[]).map((event: any) => {
        const args = event.args;
        return {
          player: args[0],
          playerMove: ["🪨 Rock", "📄 Paper", "✂️ Scissors"][Number(args[1])],
          computerMove: ["🪨 Rock", "📄 Paper", "✂️ Scissors"][Number(args[2])],
          result: ["Lose ❌", "Draw 🤝", "Win 🏆"][Number(args[3])],
          payout: ethers.formatEther(args[5]),
          hash: event.transactionHash
        };
      }).reverse();

      setHistory(formatted);

    } catch (err) {
      // Молча игнорируем ошибки истории - не критично
      console.log("Could not load history (RPC limit or timeout)");
    }
  };

  const play = async (move: number) => {
    if (!contract) return;
    
    // Contract checks: (currentBalance + yourBet) >= (yourBet * 2)
    // So: currentBalance >= yourBet (0.0001 tBNB)
    // This ensures contract can pay double if you win
    const currentBalance = parseFloat(contractBalance);
    const betAmount = 0.0001;
    
    // Add a small buffer to account for potential race conditions
    if (currentBalance < betAmount) {
      setStatus(`❌ Contract balance too low (${currentBalance.toFixed(4)} tBNB). Needs at least ${betAmount.toFixed(4)} tBNB!`);
      return;
    }
    
    setLoading(true);
    setStatus("Confirm transaction in MetaMask (0.0001 tBNB)...");

    try {
      const tx = await contract.playGame(move, {
        value: ethers.parseEther("0.0001")
      });

      setStatus("Mining transaction... ⛏️");
      const receipt = await tx.wait();

      // Parse the game result from the event
      const gameEvent = receipt.logs.find((log: any) => {
        try {
          return contract.interface.parseLog(log)?.name === "GamePlayed";
        } catch { return false; }
      });

      if (gameEvent) {
        const parsedLog = contract.interface.parseLog(gameEvent);
        const result = Number(parsedLog?.args[3]); // 0=Lose, 1=Draw, 2=Win
        
        // Update stats immediately
        setStats(prev => ({
          wins: result === 2 ? prev.wins + 1 : prev.wins,
          draws: result === 1 ? prev.draws + 1 : prev.draws,
          losses: result === 0 ? prev.losses + 1 : prev.losses
        }));

        const resultText = result === 2 ? "You WON! 🏆" : result === 1 ? "It's a DRAW! 🤝" : "You LOST! ❌";
        setStatus(`✅ ${resultText}`);
        
        // Add to history list
        const playerChoice = ["Rock", "Paper", "Scissors"][move];
        const computerChoice = Number(parsedLog?.args[2]);
        const computerChoiceText = ["🪨 Rock", "📄 Paper", "✂️ Scissors"][computerChoice];
        const playerChoiceText = ["🪨 Rock", "📄 Paper", "✂️ Scissors"][move];
        const payout = ethers.formatEther(parsedLog?.args[5]);
        
        setHistory(prev => [{
          playerMove: playerChoiceText,
          computerMove: computerChoiceText,
          result: resultText,
          payout: payout,
          hash: receipt.hash
        }, ...prev].slice(0, 10)); // Keep last 10 games
      } else {
        setStatus("✅ Game Finished! Check result below.");
      }

      setLastTxHash(receipt.hash);
      await updateBalance(contract);
      setLoading(false);

    } catch (err: any) {
      console.error(err);
      let errorMsg = "Transaction failed or rejected";
      
      if (err.code === "CALL_EXCEPTION") {
        const currentBalance = parseFloat(contractBalance);
        errorMsg = `❌ Contract rejected! Balance: ${currentBalance.toFixed(4)} tBNB (needs >= 0.0001 tBNB). Try again after balance updates.`;
      } else if (err.code === "ACTION_REJECTED") {
        errorMsg = "Transaction rejected by user";
      } else if (err.message?.includes("insufficient funds")) {
        errorMsg = "❌ Insufficient funds in your wallet";
      }
      
      // Refresh balance after error
      await updateBalance(contract);
      setStatus(errorMsg);
      setLoading(false);
    }
  };

  const depositFunds = async () => {
    if (!contract) return;
    setLoading(true);
    setStatus("Confirm deposit in MetaMask...");

    try {
      // Send tBNB directly to contract address with more gas
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      
      const tx = await signer.sendTransaction({
        to: CONTRACT_ADDRESS,
        value: ethers.parseEther("0.01"),
        gasLimit: 50000 // Add explicit gas limit
      });

      setStatus("Processing deposit... ⛏️");
      const receipt = await tx.wait();

      if (receipt?.status === 0) {
        throw new Error("Transaction failed");
      }

      setStatus("✅ Deposit successful! Contract funded.");
      await updateBalance(contract);
      setLoading(false);

    } catch (err: any) {
      console.error(err);
      let errorMsg = "Deposit failed or rejected";
      
      if (err.message?.includes("insufficient funds")) {
        errorMsg = "❌ Insufficient funds in your wallet";
      } else if (err.code === "ACTION_REJECTED") {
        errorMsg = "Transaction rejected by user";
      } else {
        errorMsg = "❌ Deposit failed. Note: Only contract owner can use depositFunds(). Try playing a game to add funds automatically!";
      }
      
      setStatus(errorMsg);
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-900 text-white flex flex-col items-center p-10 font-sans">
      <h1 className="text-4xl font-bold mb-4 text-yellow-400">BNB Betting RPS</h1>
      <p className="mb-8 text-gray-400">Bet 0.0001 tBNB - Win 0.0002 tBNB</p>

      {!accounts.length ? (
        <button onClick={connectWallet} className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-3 px-6 rounded-full transition-all">
          Connect BNB Wallet
        </button>
      ) : (
        <>
          <div className="bg-slate-800 p-4 rounded-lg mb-4 border border-slate-700 text-center">
            {accounts.map(acc => (
              <p key={acc} className="text-green-400 font-mono">{acc.substring(0, 6)}...{acc.substring(acc.length - 4)}</p>
            ))}
            <p className="text-xs text-gray-500 mt-1">Contract Pool: {contractBalance} tBNB</p>
            {parseFloat(contractBalance) < 0.0001 && (
              <div className="mt-3">
                <p className="text-red-400 text-sm mb-2">⚠️ Contract needs at least 0.0001 tBNB to operate!</p>
                <p className="text-xs text-gray-400 mb-2">Send tBNB directly to contract: {CONTRACT_ADDRESS.substring(0, 10)}...</p>
                <button 
                  onClick={depositFunds} 
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition-all disabled:opacity-50 text-sm"
                >
                  Try Deposit 0.01 tBNB
                </button>
              </div>
            )}
          </div>

          {/* Stats Display */}
          <div className="bg-slate-800 p-4 rounded-lg mb-4 border border-slate-700 w-full max-w-md">
            <h3 className="text-center text-lg font-bold mb-3 text-gray-300">Your Stats</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-green-900/30 p-3 rounded border border-green-500">
                <div className="text-2xl font-bold text-green-400">{stats.wins}</div>
                <div className="text-xs text-gray-400">Wins 🏆</div>
              </div>
              <div className="bg-gray-800 p-3 rounded border border-gray-500">
                <div className="text-2xl font-bold text-gray-400">{stats.draws}</div>
                <div className="text-xs text-gray-400">Draws 🤝</div>
              </div>
              <div className="bg-red-900/30 p-3 rounded border border-red-500">
                <div className="text-2xl font-bold text-red-400">{stats.losses}</div>
                <div className="text-xs text-gray-400">Losses ❌</div>
              </div>
            </div>
            <div className="mt-2 text-center text-sm text-gray-500">
              Total Games: {stats.wins + stats.draws + stats.losses}
            </div>
          </div>
        </>
      )}

      <div className="bg-slate-800 p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-700">
        <div className="flex justify-center gap-6 mb-8">
          <GameButton emoji="🪨" label="Rock" onClick={() => play(0)} disabled={!accounts.length || loading} />
          <GameButton emoji="📄" label="Paper" onClick={() => play(1)} disabled={!accounts.length || loading} />
          <GameButton emoji="✂️" label="Scissors" onClick={() => play(2)} disabled={!accounts.length || loading} />
        </div>
        <p className="text-center text-lg font-semibold text-yellow-200 animate-pulse">{status}</p>
        {lastTxHash && (
          <div className="mt-4 text-center">
            <a 
              href={`https://testnet.bscscan.com/tx/${lastTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline text-sm"
            >
              View Transaction on BSCScan →
            </a>
          </div>
        )}
      </div>

      <div className="mt-10 w-full max-w-2xl">
        <h2 className="text-2xl font-bold mb-4 text-gray-300">Recent Games</h2>
        <div className="space-y-2">
          {history.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No games played yet. Start playing to see your history!</p>
          ) : (
            history.map((game, idx) => (
              <div 
                key={idx} 
                className={`p-3 rounded flex justify-between items-center border-l-4 ${
                  game.result.includes("WON") ? "bg-green-900/30 border-green-500" :
                  game.result.includes("LOST") ? "bg-red-900/30 border-red-500" : 
                  "bg-gray-800 border-gray-500"
                }`}
              >
                <div>
                  <div className="font-semibold">{game.playerMove} vs {game.computerMove}</div>
                  <a 
                    href={`https://testnet.bscscan.com/tx/${game.hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:text-blue-300 underline"
                  >
                    {game.hash.substring(0, 10)}...{game.hash.substring(game.hash.length - 8)}
                  </a>
                </div>
                <div className="text-right">
                  <div className="font-bold">{game.result}</div>
                  <div className="text-xs text-yellow-500">
                    {parseFloat(game.payout) > 0 ? `+${game.payout} tBNB` : "-0.0001 tBNB"}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}

function GameButton({ emoji, label, onClick, disabled }: any) {
  return (
    <button onClick={onClick} disabled={disabled} className="flex flex-col items-center justify-center w-24 h-24 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-xl transition-all border-b-4 border-slate-900 active:border-b-0 active:translate-y-1">
      <span className="text-3xl mb-1">{emoji}</span>
      <span className="text-xs font-bold uppercase">{label}</span>
    </button>
  );
}