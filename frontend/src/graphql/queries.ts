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
