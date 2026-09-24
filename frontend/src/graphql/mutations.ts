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
      client { id name }
    }
  }
`;

export const CREATE_CLIENT_MUTATION = gql`
  mutation CreateClient($name: String!, $email: String) {
    createClient(name: $name, email: $email) {
      id
      name
      email
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

export const ASK_ABOUT_QUOTATION_MUTATION = gql`
  mutation AskAboutQuotation($quotationId: ID!, $question: String!) {
    askAboutQuotation(quotationId: $quotationId, question: $question) {
      answer
    }
  }
`;

export const APPROVE_DOCUMENT_MUTATION = gql`
  mutation ApproveDocument($id: String!) {
    approveDocument(id: $id) {
      id
      status
    }
  }
`;

export const REJECT_DOCUMENT_MUTATION = gql`
  mutation RejectDocument($id: String!, $reason: String!) {
    rejectDocument(id: $id, reason: $reason) {
      id
      status
    }
  }
`;

export const ASK_PLAYBOOK_MUTATION = gql`
  mutation AskPlaybook($question: String!) {
    askPlaybook(question: $question) {
      answer
      citations {
        documentTitle
        chunkIndex
        excerpt
      }
    }
  }
`;

export const DELETE_DOCUMENT_MUTATION = gql`
  mutation DeleteDocument($id: String!) {
    deleteDocument(id: $id)
  }
`;

export const DELETE_CLIENT_MUTATION = gql`
  mutation DeleteClient($id: ID!) {
    deleteClient(id: $id)
  }
`;

export const INVITE_USER_MUTATION = gql`
  mutation InviteUser($name: String!, $email: String!, $role: Role!) {
    inviteUser(name: $name, email: $email, role: $role)
  }
`;

export const ACCEPT_INVITE_MUTATION = gql`
  mutation AcceptInvite($token: String!, $password: String!) {
    acceptInvite(token: $token, password: $password)
  }
`;

export const REQUEST_PASSWORD_RESET_MUTATION = gql`
  mutation RequestPasswordReset($email: String!) {
    requestPasswordReset(email: $email)
  }
`;

export const RESET_PASSWORD_MUTATION = gql`
  mutation ResetPassword($token: String!, $password: String!) {
    resetPassword(token: $token, password: $password)
  }
`;

export const DEACTIVATE_USER_MUTATION = gql`
  mutation DeactivateUser($id: String!) {
    deactivateUser(id: $id)
  }
`;
