import { gql } from "@apollo/client";

export const DASHBOARD_STATS_QUERY = gql`
  query DashboardStats($range: DateRangeInput) {
    dashboardStats(range: $range) {
      totalQuotations
      totalSent
      totalApproved
      totalRejected
      conversionRate
      totalPipelineValue
      totalApprovedValue
      avgDealSize
      medianDealSize
      p90DealSize
      totalQuotationsTrend { delta pct direction }
      conversionRateTrend  { delta pct direction }
      totalPipelineValueTrend { delta pct direction }
      totalApprovedValueTrend { delta pct direction }
      avgDealSizeTrend { delta pct direction }
    }
  }
`;

// ── Pipeline Intelligence panels — one query per panel so each loads independently ──

export const REP_PERFORMANCE_QUERY = gql`
  query RepPerformance($range: DateRangeInput, $limit: Int! = 10) {
    repPerformance(range: $range, limit: $limit) {
      repId
      repName
      isOthers
      totalSent
      totalApproved
      approvedRevenue
      winRate
    }
  }
`;

export const APPROVAL_RATE_TREND_QUERY = gql`
  query ApprovalRateTrend {
    approvalRateTrend {
      month
      sent
      approved
      rejected
      rate
    }
  }
`;

export const STALE_QUOTATIONS_QUERY = gql`
  query StaleQuotations($thresholdDays: Int! = 14) {
    staleQuotations(thresholdDays: $thresholdDays) {
      thresholdDays
      totalCount
      totalValue
      items {
        id
        quotationNumber
        title
        clientId
        clientName
        repName
        total
        sentAt
        daysStale
      }
    }
  }
`;

export const CLIENT_CONCENTRATION_QUERY = gql`
  query ClientConcentration($range: DateRangeInput) {
    clientConcentration(range: $range) {
      clientId
      clientName
      approvedRevenue
      shareOfTotal
      quoteCount
    }
  }
`;

export const DEAL_VELOCITY_QUERY = gql`
  query DealVelocity($range: DateRangeInput) {
    dealVelocity(range: $range) {
      transition
      avgDays
      p90Days
      sampleSize
    }
  }
`;

export const QUARTERLY_HISTORY_QUERY = gql`
  query QuarterlyHistory($quarters: Int! = 4) {
    quarterlyHistory(quarters: $quarters) {
      quarter
      from
      to
      isCurrent
      totalQuotations
      totalApproved
      pipelineValue
      approvedRevenue
      winRate
      avgDealSize
    }
  }
`;

export const REP_DEAL_SIZE_WIN_RATES_QUERY = gql`
  query RepDealSizeWinRates($range: DateRangeInput, $offset: Int! = 0, $limit: Int! = 10) {
    repDealSizeWinRates(range: $range, offset: $offset, limit: $limit) {
      buckets
      totalReps
      offset
      limit
      teamAverage {
        bucket
        approved
        rejected
        decided
        winRate
      }
      reps {
        repId
        repName
        decided
        winRate
        cells {
          bucket
          approved
          rejected
          decided
          winRate
        }
      }
    }
  }
`;

export const QUOTATIONS_QUERY = gql`
  query Quotations($take: Int, $skip: Int, $filter: QuotationFilterInput) {
    quotations(take: $take, skip: $skip, filter: $filter) {
      id
      quotationNumber
      title
      client { id name }
      status
      total
      createdAt
    }
  }
`;

export const QUOTATION_QUERY = gql`
  query Quotation($id: ID!) {
    quotation(id: $id) {
      id
      quotationNumber
      version
      title
      client { id name }
      status
      notes
      taxRate
      subtotal
      taxAmount
      total
      createdAt
      publicToken
      createdBy {
        id
        name
        email
        role
      }
      items {
        id
        description
        quantity
        unitPrice
        lineTotal
        sortOrder
      }
    }
  }
`;

export const ME_QUERY = gql`
  query Me {
    me {
      id
      name
      email
      role
    }
  }
`;

export const SALES_REPS_QUERY = gql`
  query SalesReps {
    salesReps {
      id
      name
    }
  }
`;

export const CONVERSION_SCORE_QUERY = gql`
  query ConversionScore($quotationId: ID!) {
    conversionScore(quotationId: $quotationId) {
      score
      label
    }
  }
`;

export const WIN_LOSS_ANALYSIS_QUERY = gql`
  query WinLossAnalysis {
    winLossAnalysis {
      approvalRate
      avgApprovedDeal
      avgRejectedDeal
      byRep {
        repName
        sent
        approved
        rejected
        approvalRate
      }
      byClient {
        clientId
        clientName
        totalQuotes
        approved
        rejected
        approvalRate
        avgDealSize
        totalRevenue
      }
    }
  }
`;

export const CLIENTS_QUERY = gql`
  query Clients($search: String) {
    clients(search: $search) {
      id
      name
      email
    }
  }
`;

export const CLIENTS_PAGE_QUERY = gql`
  query ClientsPage($search: String, $skip: Int, $take: Int) {
    clientsPage(search: $search, skip: $skip, take: $take) {
      items {
        id
        name
        email
        createdAt
      }
      total
    }
  }
`;

export const QUOTATION_SNAPSHOTS_QUERY = gql`
  query QuotationSnapshots($quotationId: ID!) {
    quotationSnapshots(quotationId: $quotationId) {
      id
      quotationId
      content
      createdAt
    }
  }
`;

export const STATUS_HISTORY_QUERY = gql`
  query StatusHistory($quotationId: ID!) {
    statusHistory(quotationId: $quotationId) {
      id
      fromStatus
      toStatus
      note
      changedAt
      changedBy {
        name
      }
    }
  }
`;

export const QUOTATION_BY_TOKEN_QUERY = gql`
  query QuotationByToken($token: String!) {
    quotationByToken(token: $token) {
      quotationNumber
      title
      clientName
      repName
      status
      notes
      taxRate
      subtotal
      taxAmount
      total
      items {
        id
        description
        quantity
        unitPrice
        lineTotal
        sortOrder
      }
    }
  }
`;

export const CONVERSION_SCORES_QUERY = gql`
  query ConversionScores($quotationIds: [ID!]!) {
    conversionScores(quotationIds: $quotationIds) {
      quotationId
      score
      label
    }
  }
`;

export const DOCUMENTS_QUERY = gql`
  query Documents {
    documents {
      id
      filename
      sizeBytes
      status
      rejectedReason
      createdAt
    }
  }
`;

export const HAS_READY_DOCUMENTS_QUERY = gql`
  query HasReadyDocuments {
    hasReadyDocuments
  }
`;

export const SIMILAR_QUOTATIONS_QUERY = gql`
  query SimilarQuotations($quotationId: ID!, $limit: Float) {
    similarQuotations(quotationId: $quotationId, limit: $limit) {
      id
      title
      clientName
      total
      status
      score
    }
  }
`;

export const USERS_QUERY = gql`
  query Users($skip: Int, $take: Int, $search: String) {
    users(skip: $skip, take: $take, search: $search) {
      items {
        id
        name
        email
        role
        isActive
        createdAt
      }
      total
    }
  }
`;
