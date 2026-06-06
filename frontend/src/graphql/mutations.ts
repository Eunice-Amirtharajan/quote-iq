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
      clientName
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

export const DELETE_QUOTATION_MUTATION = gql`
  mutation DeleteQuotation($id: ID!) {
    deleteQuotation(id: $id)
  }
`;

export const UPDATE_QUOTATION_MUTATION = gql`
  mutation UpdateQuotation($id: ID!, $input: UpdateQuotationInput!) {
    updateQuotation(id: $id, input: $input) {
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
      createdBy { id name email role }
      items { id description quantity unitPrice lineTotal sortOrder }
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
