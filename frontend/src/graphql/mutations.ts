import { gql } from "@apollo/client";

export const LOGIN_MUTATION = gql`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      id
      name
      email
      role
    }
  }
`;

export const LOGOUT_MUTATION = gql`
  mutation Logout {
    logout
  }
`;

export const QUOTATION_SUMMARY_MUTATION = gql`
  mutation QuotationSummary($quotationId: ID!) {
    quotationSummary(quotationId: $quotationId) {
      summary
      recommendation
      keyPoints
      riskFactors
    }
  }
`;
