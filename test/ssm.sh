#!/bin/bash

random_value=$(date | md5sum)
parameter_name="ExampleParameter"
parameter_value="${random_value//  -/}"

bin/aws-tools ssm ls
bin/aws-tools ssm add $parameter_name $parameter_value "@bowtie/aws-tools test SSM script" --force
bin/aws-tools ssm get $parameter_name
bin/aws-tools ssm del $parameter_name
