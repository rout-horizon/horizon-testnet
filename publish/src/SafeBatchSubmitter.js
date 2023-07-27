'use strict';

const ethers = require('ethers');
const { EthersAdapter } = require('@safe-global/protocol-kit');
const Safe = require('@safe-global/protocol-kit').default;
// const GnosisSafe = require('@gnosis.pm/safe-core-sdk').default;
// const SafeServiceClient = require('@gnosis.pm/safe-service-client').default;
const SafeApiKit = require('@safe-global/api-kit').default;

// const safeService = 
class SafeBatchSubmitter {
	constructor({ network, signer, safeAddress }) {
		this.network = network;
		this.signer = signer;
		this.safeAddress = safeAddress;
		
		this.ethAdapter = new EthersAdapter({
			ethers,
			signerOrProvider: signer,
		});
		
		const txServiceUrl = `https://safe-transaction${network === 'goerli' ? '-goerli' : ''}.safe.global`;

		this.service = new SafeApiKit({
			txServiceUrl: `https://safe-transaction${network === 'goerli' ? '-goerli' : ''}.safe.global`,
			ethAdapter: this.ethAdapter
		});
	}

	async init() {
		const { ethAdapter, service, safeAddress, signer } = this;
		this.transactions = [];
		this.safe = await Safe.create({
			ethAdapter:ethAdapter,
			safeAddress,
		});
		// check if signer is on the list of owners
		if (!(await this.safe.isOwner(signer.address))) {
			throw Error(`Account ${signer.address} is not a signer on this safe`);
		}
		const currentNonce = await this.safe.getNonce();
		const pendingTxns = await service.getPendingTransactions(safeAddress, currentNonce);
		return { currentNonce, pendingTxns };
	}

	async appendTransaction({ to, value = '0', data, force }) {
		const { safe, service, safeAddress, transactions } = this;

		console.log("force1", force);
		if (!force) {
			console.log("force2", force);
			// check it does not exist in the pending list
			// Note: this means that a duplicate transaction - like an acceptOwnership on
			// the same contract cannot be added in one batch. This could be useful in situations
			// where you want to accept, nominate another owner, migrate, then accept again.
			// In these cases, use "force: true"
			const currentNonce = await safe.getNonce();
			const pendingTxns = await service.getPendingTransactions(safeAddress, currentNonce);

			this.currentNonce = currentNonce;
			this.pendingTxns = pendingTxns;

			this.unusedNoncePosition = currentNonce;

			let matchedTxnIsPending = false;

			for (const { nonce } of pendingTxns.results) {
				// figure out what the next unused nonce position is (including everything else in the queue)
				this.unusedNoncePosition = Math.max(this.unusedNoncePosition, nonce + 1);
				console.log('Incremented nonce to ', this.unusedNoncePosition);

				const dataDecoded = pendingTxns.results.parameters;
				if (dataDecoded !== undefined) {
					matchedTxnIsPending =
						matchedTxnIsPending ||
						(dataDecoded.valueDecoded || []).find(
							entry => entry.to === to && entry.data === data && entry.value === value
						);
				}
			}

			if (matchedTxnIsPending) {
				return {};
			}
		}

		transactions.push({ to, data, value, nonce: this.unusedNoncePosition });
		// transactions.push({ to, data, value });
		return { appended: true };
	}

	async submit() {
		const { safe, transactions, safeAddress, service, signer, unusedNoncePosition: nonce } = this;
		if (!safe) {
			throw Error('Safe must first be initialized');
		}
		if (!transactions.length) {
			return { transactions };
		}
		console.log("$$$$$$$$$transactions $$$$$$$$$$$$", transactions);
		console.log("$$$$$$$$$transactions $$$$$$$$$$$$", typeof(transactions));
		console.log("HELLOOOOOOOO");
		try {
			const safeTransaction = await safe.createTransaction({transactions});
			await safe.signTransaction(safeTransaction);
			const safeTxHash = await safe.getTransactionHash(safeTransaction);
			const senderAddress = await signer.getAddress();
			await service.proposeTransaction({
				safeAddress,
				safeTransactionData: safeTransaction.data,
				safeTxHash,
				senderAddress: senderAddress,
			});
	
			return { transactions, nonce };
		} catch (e) {
			console.log(e instanceof TypeError);
			console.log(e.message);              // "null has no properties"
			console.log(e.name);                 // "TypeError"
			console.log(e.fileName);             // "Scratchpad/1"
			console.log(e.lineNumber);           // 2
			console.log(e.columnNumber);         // 2
			console.log(e.stack);
			// throw Error(`Error trying to submit batch to safe.\n${err}`);
		}

		// try {
		// } catch (err) {
		// 	throw Error(`Error trying to submit batch to safe.\n${err}`);
		// }
	}
}

module.exports = SafeBatchSubmitter;