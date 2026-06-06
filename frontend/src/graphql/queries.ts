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