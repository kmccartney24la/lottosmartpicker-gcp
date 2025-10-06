variable "project"    { type = string }
variable "region"     { type = string  default = "us-central1" }
variable "repo"       { type = string  default = "app" }
variable "image_name" { type = string  default = "lottosmartpicker-scratchers" }

variable "service" { type = string default = "lottosmartpicker-scratchers-web" }
variable "job"     { type = string default = "scratchers" }
