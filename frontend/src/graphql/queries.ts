import { gql } from "@apollo/client";

export const DASHBOARD_STATS_QUERY = gql`
  query DashboardStats {
    dashboardStats {
      totalQuotations
      totalSent
      totalApproved
      totalRejected
      conversionRate
      totalPipelineValue
      totalApprovedValue
    }
  }
`;

export const QUOTATIONS_QUERY = gql`
  query Quotations($filter: QuotationFilterInput) {
    quotations(filter: $filter) {
      id
      quotationNumber
      title
      clientName
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
      title
      clientName
      status
      notes
      taxRate
      subtotal
      taxAmount
      total
      createdAt
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
      byDealSize {
        bucket
        total
        approved
        approvalRate
      }
    }
  }
`;

export const ASK_ABOUT_QUOTATION_QUERY = gql`
  query AskAboutQuotation($quotationId: ID!, $question: String!) {
    askAboutQuotation(quotationId: $quotationId, question: $question) {
      answer
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