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

export const CREATE_QUOTATION_MUTATION = gql`
  mutation CreateQuotation($input: CreateQuotationInput!) {
    createQuotation(input: $input) {
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

export const UPDATE_QUOTATION_STATUS_MUTATION = gql`
  mutation UpdateQuotationStatus($id: ID!, $input: UpdateQuotationStatusInput!) {
    updateQuotationStatus(id: $id, input: $input) {
      id
      status
    }
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
