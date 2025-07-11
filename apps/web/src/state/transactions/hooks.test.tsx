import { BigNumber } from '@ethersproject/bignumber'
import { permit2Address } from '@uniswap/permit2-sdk'
import { useAccount } from 'hooks/useAccount'
import store from 'state'
import {
  useHasPendingApproval,
  useHasPendingRevocation,
  useTransactionAdder,
  useTransactionCanceller,
  useTransactionRemover,
} from 'state/transactions/hooks'
import { clearAllTransactions, finalizeTransaction } from 'state/transactions/reducer'
import { TransactionInfo, TransactionType } from 'state/transactions/types'
import { mocked } from 'test-utils/mocked'
import { act, renderHook } from 'test-utils/render'
import { USDC_MAINNET } from 'uniswap/src/constants/tokens'
import { UniverseChainId } from 'uniswap/src/features/chains/types'
import {
  ApproveTransactionInfo,
  TransactionOriginType,
  TransactionStatus,
  TransactionType as UniswapTransactionType,
} from 'uniswap/src/features/transactions/types/transactionDetails'

const PERMIT2_ADDRESS_MAINNET = permit2Address(UniverseChainId.Mainnet)

const pendingTransactionResponse = {
  hash: '0x123',
  timestamp: 1000,
  from: '0x123',
  wait: vi.fn(),
  nonce: 1,
  gasLimit: BigNumber.from(1000),
  data: '0x',
  value: BigNumber.from(0),
  chainId: UniverseChainId.Mainnet,
  confirmations: 0,
  blockNumber: undefined,
  blockHash: undefined,
}

const mockApprovalTransactionInfo: ApproveTransactionInfo = {
  type: UniswapTransactionType.Approve,
  tokenAddress: USDC_MAINNET.address,
  spender: PERMIT2_ADDRESS_MAINNET,
  approvalAmount: '10000',
}

const mockRevocationTransactionInfo: TransactionInfo = {
  ...mockApprovalTransactionInfo,
  approvalAmount: '0',
}

vi.mock('hooks/useAccount')

describe('Transactions hooks', () => {
  beforeEach(() => {
    mocked(useAccount).mockReturnValue({
      chainId: UniverseChainId.Mainnet,
      address: '0x123',
      status: 'connected',
    } as unknown as ReturnType<typeof useAccount>)

    vi.useFakeTimers()
    store.dispatch(clearAllTransactions({ chainId: UniverseChainId.Mainnet }))

    vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function addPendingTransaction(txInfo: TransactionInfo) {
    const { result } = renderHook(() => useTransactionAdder())
    act(() => {
      result.current(pendingTransactionResponse, txInfo)
    })
  }

  function addConfirmedTransaction(txInfo: TransactionInfo) {
    addPendingTransaction(txInfo)

    act(() => {
      store.dispatch(
        finalizeTransaction({
          chainId: UniverseChainId.Mainnet,
          hash: pendingTransactionResponse.hash,
          status: TransactionStatus.Success,
        }),
      )
    })
  }

  it('useTransactionAdder adds a transaction', () => {
    addPendingTransaction(mockApprovalTransactionInfo)
    expect(store.getState().localWebTransactions[UniverseChainId.Mainnet][pendingTransactionResponse.hash]).toEqual({
      id: pendingTransactionResponse.hash,
      hash: pendingTransactionResponse.hash,
      chainId: pendingTransactionResponse.chainId,
      nonce: pendingTransactionResponse.nonce,
      info: mockApprovalTransactionInfo,
      from: pendingTransactionResponse.from,
      addedTime: Date.now(),
      deadline: undefined,
      status: TransactionStatus.Pending,
      transactionOriginType: TransactionOriginType.Internal,
    })
  })

  it('useTransactionRemover removes a transaction', () => {
    addPendingTransaction(mockApprovalTransactionInfo)

    const { result: remover } = renderHook(() => useTransactionRemover())
    act(() => {
      remover.current(pendingTransactionResponse.hash)
    })
    expect(
      store.getState().localWebTransactions[UniverseChainId.Mainnet][pendingTransactionResponse.hash],
    ).toBeUndefined()
  })

  describe('useHasPendingApproval', () => {
    it('returns true when there is a pending transaction', () => {
      addPendingTransaction(mockApprovalTransactionInfo)
      const { result } = renderHook(() => useHasPendingApproval(USDC_MAINNET, PERMIT2_ADDRESS_MAINNET))
      expect(result.current).toBe(true)
    })

    it('returns false when there is a pending transaction but it is not an approval', () => {
      addPendingTransaction({
        type: TransactionType.CLAIM,
        recipient: '0x123',
      })
      const { result } = renderHook(() => useHasPendingApproval(USDC_MAINNET, PERMIT2_ADDRESS_MAINNET))
      expect(result.current).toBe(false)
    })

    it('returns false when there is a pending approval but it is not for the current chain', () => {
      mocked(useAccount).mockReturnValue({ chainId: UniverseChainId.Base } as ReturnType<typeof useAccount>)
      addPendingTransaction(mockApprovalTransactionInfo)
      const { result } = renderHook(() => useHasPendingApproval(USDC_MAINNET, PERMIT2_ADDRESS_MAINNET))
      expect(result.current).toBe(false)
    })

    it('returns false when there is a confirmed approval transaction', () => {
      addConfirmedTransaction(mockApprovalTransactionInfo)
      const { result } = renderHook(() => useHasPendingApproval(USDC_MAINNET, PERMIT2_ADDRESS_MAINNET))
      expect(result.current).toBe(false)
    })

    it('returns false when there are no pending transactions', () => {
      const { result } = renderHook(() => useHasPendingApproval(USDC_MAINNET, PERMIT2_ADDRESS_MAINNET))
      expect(result.current).toBe(false)
    })

    it('returns false when there is a pending revocation', () => {
      addPendingTransaction(mockRevocationTransactionInfo)
      const { result } = renderHook(() => useHasPendingApproval(USDC_MAINNET, PERMIT2_ADDRESS_MAINNET))
      expect(result.current).toBe(false)
    })
  })

  describe('useHasPendingRevocation', () => {
    it('returns true when there is a pending revocation', () => {
      addPendingTransaction(mockRevocationTransactionInfo)
      const { result } = renderHook(() => useHasPendingRevocation(USDC_MAINNET, PERMIT2_ADDRESS_MAINNET))
      expect(result.current).toBe(true)
    })

    it('returns false when there is a pending transaction but it is not a revocation', () => {
      addPendingTransaction({
        type: TransactionType.CLAIM,
        recipient: '0x123',
      })
      const { result } = renderHook(() => useHasPendingRevocation(USDC_MAINNET, PERMIT2_ADDRESS_MAINNET))
      expect(result.current).toBe(false)
    })

    it('returns false when there is a pending revocation but it is not for the current chain', () => {
      mocked(useAccount).mockReturnValue({ chainId: UniverseChainId.Base } as ReturnType<typeof useAccount>)
      addPendingTransaction(mockRevocationTransactionInfo)
      const { result } = renderHook(() => useHasPendingRevocation(USDC_MAINNET, PERMIT2_ADDRESS_MAINNET))
      expect(result.current).toBe(false)
    })

    it('returns false when there is a confirmed approval transaction', () => {
      addConfirmedTransaction(mockRevocationTransactionInfo)
      const { result } = renderHook(() => useHasPendingRevocation(USDC_MAINNET, PERMIT2_ADDRESS_MAINNET))
      expect(result.current).toBe(false)
    })

    it('returns false when there are no pending transactions', () => {
      const { result } = renderHook(() => useHasPendingRevocation(USDC_MAINNET, PERMIT2_ADDRESS_MAINNET))
      expect(result.current).toBe(false)
    })

    it('returns false when there is a pending approval', () => {
      addPendingTransaction(mockApprovalTransactionInfo)
      const { result } = renderHook(() => useHasPendingRevocation(USDC_MAINNET, PERMIT2_ADDRESS_MAINNET))
      expect(result.current).toBe(false)
    })
  })

  describe('useTransactionCanceller', () => {
    it('Replaces the original tx with a cancel tx with a different hash', () => {
      addPendingTransaction(mockApprovalTransactionInfo)
      const { result: canceller } = renderHook(() => useTransactionCanceller())

      const originalTransactionDetails =
        store.getState().localWebTransactions[UniverseChainId.Mainnet][pendingTransactionResponse.hash]

      act(() => canceller.current(pendingTransactionResponse.hash, UniverseChainId.Mainnet, '0x456'))

      expect(
        store.getState().localWebTransactions[UniverseChainId.Mainnet][pendingTransactionResponse.hash],
      ).toBeUndefined()

      expect(store.getState().localWebTransactions[UniverseChainId.Mainnet]['0x456']).toEqual({
        ...originalTransactionDetails,
        hash: '0x456',
        cancelled: true,
      })
    })
  })
})
