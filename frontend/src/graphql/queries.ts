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
  query Quotations {
    quotations {
      id
      quotationNumber
      title
      status
      total
      createdAt
      client {
        name
        company
      }
    }
  }
`;

export const CLIENTS_QUERY = gql`
  query Clients {
    clients {
      id
      name
      company
      email
      phone
      city
      country
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
      status
      notes
      taxRate
      subtotal
      taxAmount
      total
      validUntil
      createdAt
      client {
        id
        name
        company
        email
        city
        country
      }
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