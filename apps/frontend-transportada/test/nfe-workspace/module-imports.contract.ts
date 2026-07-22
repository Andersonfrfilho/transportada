/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  ImportPollingState,
  NfeDocumentListPage,
  NfeImportListPage,
  NfeImportSummary,
  NfeWorkspaceClient,
  NfeWorkspaceClientFactory,
  RequestUploadInput,
} from '../../src/modules/nfe-workspace/shared/nfeWorkspaceClient.service'
import type {
  NfeWorkspaceController,
  UploadDraftController,
} from '../../src/modules/nfe-workspace/hooks/useNfeWorkspace.hook'
import type { NfeWorkspaceViewModelFactory } from '../../src/modules/nfe-workspace/shared/nfeWorkspaceViewModel.service'
import type {
  NfeDocumentListPageContract,
  NfeImportListPageContract,
  NfeImportSummaryContract,
} from './nfe-workspace.fixture'

type Assert<TValue extends true> = TValue
type Equal<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends <T>() => T extends TRight ? 1 : 2 ? true : false

export type NfeImportSummaryIsExact = Assert<Equal<NfeImportSummary, NfeImportSummaryContract>>
export type NfeImportListPageIsExact = Assert<Equal<NfeImportListPage, NfeImportListPageContract>>
export type NfeDocumentListPageIsExact = Assert<
  Equal<NfeDocumentListPage, NfeDocumentListPageContract>
>

export type NfeWorkspaceModuleContracts = {
  readonly importPollingState: ImportPollingState
  readonly nfeWorkspaceClient: NfeWorkspaceClient
  readonly nfeWorkspaceClientFactory: NfeWorkspaceClientFactory
  readonly nfeWorkspaceController: NfeWorkspaceController
  readonly nfeWorkspaceViewModelFactory: NfeWorkspaceViewModelFactory
  readonly requestUploadInput: RequestUploadInput
  readonly uploadDraftController: UploadDraftController
}
